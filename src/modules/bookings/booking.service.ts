import { v4 as uuidv4 } from 'uuid';
import {
  ISlotRepository,
  IConsultationRepository,
  IDoctorRepository,
  IPaymentRepository,
} from '../../core/database/repositories.interface.js';
import { ConsultationEntity, ConsultationStatus, PaymentEntity } from '../../core/types/index.js';
import { CreateBookingInput } from './booking.dto.js';
import { NotFoundError, ForbiddenError } from '../../core/errors/index.js';
import { CryptoService } from '../../core/security/crypto.js';
import { slotBookingCounter, activeConsultationsGauge } from '../../core/metrics/index.js';
import { logger } from '../../core/logging/logger.js';
import { config } from '../../core/config/index.js';

export interface BookingResult {
  consultation: ConsultationEntity & { decryptedSymptoms?: string };
  payment: PaymentEntity;
  slot: any;
}

export class BookingService {
  constructor(
    private readonly slotRepo: ISlotRepository,
    private readonly consultationRepo: IConsultationRepository,
    private readonly doctorRepo: IDoctorRepository,
    private readonly paymentRepo: IPaymentRepository
  ) {}

  /**
   * Concurrency-Safe Atomic Booking Flow with Idempotency Support
   */
  public async bookConsultation(
    patientId: string,
    input: CreateBookingInput,
    idempotencyKey?: string
  ): Promise<BookingResult> {
    const slot = await this.slotRepo.findById(input.slotId);
    if (!slot) {
      throw new NotFoundError('Availability slot', input.slotId);
    }

    const doctor = await this.doctorRepo.findById(slot.doctorId);
    if (!doctor) {
      throw new NotFoundError('Doctor', slot.doctorId);
    }

    // 1. Calculate slot reservation expiration (e.g. 10 minutes)
    const timeoutMs = config.SLOT_RESERVATION_TIMEOUT_MINUTES * 60 * 1000;
    const reservedUntil = new Date(Date.now() + timeoutMs);

    // 2. Atomic Lock & Reserve (SELECT FOR UPDATE)
    let reservedSlot;
    try {
      reservedSlot = await this.slotRepo.lockAndReserveSlot(slot.id, reservedUntil);
      slotBookingCounter.inc({ status: 'SUCCESS' });
    } catch (err: any) {
      slotBookingCounter.inc({ status: 'CONFLICT_ALREADY_BOOKED' });
      throw err;
    }

    // 3. Encrypt Protected Health Information (PHI)
    const encryptedSymptoms = CryptoService.encrypt(input.symptoms);

    // 4. Create Consultation in PENDING state
    let consultation: ConsultationEntity;
    try {
      consultation = await this.consultationRepo.create({
        patientId,
        doctorId: doctor.id,
        slotId: reservedSlot.id,
        status: 'PENDING',
        encryptedSymptoms,
      });
    } catch (err) {
      // Compensating action: release slot if consultation record creation fails
      await this.slotRepo.releaseSlot(reservedSlot.id);
      throw err;
    }

    // 5. Initiate Payment Record
    const txRef = `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const payment = await this.paymentRepo.create({
      consultationId: consultation.id,
      amount: doctor.consultationFee,
      currency: 'INR',
      status: 'PENDING',
      transactionRef: txRef,
      idempotencyKey,
    });

    logger.info(
      { consultationId: consultation.id, patientId, doctorId: doctor.id, slotId: slot.id },
      'Slot reserved and consultation created in PENDING status'
    );

    return {
      consultation: {
        ...consultation,
        decryptedSymptoms: input.symptoms,
      },
      payment,
      slot: reservedSlot,
    };
  }

  public async getConsultationById(
    consultationId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<ConsultationEntity & { decryptedSymptoms?: string }> {
    const consultation = await this.consultationRepo.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    // IDOR Authorization Guard: Only patient, assigned doctor, or admin can view
    if (userRole === 'PATIENT' && consultation.patientId !== requestingUserId) {
      throw new ForbiddenError('You are not authorized to view this consultation');
    }

    if (userRole === 'DOCTOR') {
      const doc = await this.doctorRepo.findByUserId(requestingUserId);
      if (!doc || doc.id !== consultation.doctorId) {
        throw new ForbiddenError('You are not the assigned doctor for this consultation');
      }
    }

    let decryptedSymptoms: string | undefined;
    if (consultation.encryptedSymptoms) {
      try {
        decryptedSymptoms = CryptoService.decrypt(consultation.encryptedSymptoms);
      } catch (err) {
        logger.error({ err, consultationId }, 'Failed to decrypt symptoms');
        decryptedSymptoms = '[Encrypted Health Data]';
      }
    }

    return {
      ...consultation,
      decryptedSymptoms,
    };
  }

  public async getPatientConsultations(patientId: string): Promise<Array<ConsultationEntity & { decryptedSymptoms?: string }>> {
    const consultations = await this.consultationRepo.findByPatientId(patientId);
    return consultations.map((c) => ({
      ...c,
      decryptedSymptoms: c.encryptedSymptoms ? CryptoService.decrypt(c.encryptedSymptoms) : undefined,
    }));
  }

  public async getDoctorConsultations(
    doctorUserId: string,
    status?: ConsultationStatus
  ): Promise<Array<ConsultationEntity & { decryptedSymptoms?: string }>> {
    const doctor = await this.doctorRepo.findByUserId(doctorUserId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile for user', doctorUserId);
    }

    const consultations = await this.consultationRepo.findByDoctorId(doctor.id, status);
    return consultations.map((c) => ({
      ...c,
      decryptedSymptoms: c.encryptedSymptoms ? CryptoService.decrypt(c.encryptedSymptoms) : undefined,
    }));
  }

  public async updateStatus(
    consultationId: string,
    doctorUserId: string,
    newStatus: ConsultationStatus,
    notes?: string
  ): Promise<ConsultationEntity> {
    const consultation = await this.consultationRepo.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    const doctor = await this.doctorRepo.findByUserId(doctorUserId);
    if (!doctor || doctor.id !== consultation.doctorId) {
      throw new ForbiddenError('Only the assigned doctor can update consultation status');
    }

    const updated = await this.consultationRepo.updateStatus(consultationId, newStatus, notes);

    // Track active consultations in Prometheus
    if (newStatus === 'IN_PROGRESS' && consultation.status !== 'IN_PROGRESS') {
      activeConsultationsGauge.inc();
    } else if (
      (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') &&
      consultation.status === 'IN_PROGRESS'
    ) {
      activeConsultationsGauge.dec();
    }

    logger.info({ consultationId, from: consultation.status, to: newStatus }, 'Consultation status updated');
    return updated;
  }
}
