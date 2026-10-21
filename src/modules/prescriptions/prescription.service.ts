import crypto from 'crypto';
import {
  IPrescriptionRepository,
  IConsultationRepository,
  IDoctorRepository,
} from '../../core/database/repositories.interface.js';
import { PrescriptionEntity } from '../../core/types/index.js';
import { CreatePrescriptionInput } from './prescription.dto.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../core/errors/index.js';
import { CryptoService } from '../../core/security/crypto.js';
import { config } from '../../core/config/index.js';
import { logger } from '../../core/logging/logger.js';

export interface DecryptedPrescription extends Omit<PrescriptionEntity, 'encryptedDiagnosis'> {
  diagnosis: string;
}

export class PrescriptionService {
  constructor(
    private readonly prescriptionRepo: IPrescriptionRepository,
    private readonly consultationRepo: IConsultationRepository,
    private readonly doctorRepo: IDoctorRepository
  ) {}

  public async issuePrescription(
    doctorUserId: string,
    input: CreatePrescriptionInput
  ): Promise<DecryptedPrescription> {
    const consultation = await this.consultationRepo.findById(input.consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', input.consultationId);
    }

    const doctor = await this.doctorRepo.findByUserId(doctorUserId);
    if (!doctor || doctor.id !== consultation.doctorId) {
      throw new ForbiddenError('Only the assigned doctor can issue a prescription for this consultation');
    }

    if (consultation.status === 'CANCELLED') {
      throw new ConflictError('Cannot issue prescription for a cancelled consultation');
    }

    // Check if prescription already exists for this consultation
    const existing = await this.prescriptionRepo.findByConsultationId(consultation.id);
    if (existing) {
      throw new ConflictError('A prescription has already been issued for this consultation');
    }

    // 1. Encrypt Diagnosis (Protected Health Information)
    const encryptedDiagnosis = CryptoService.encrypt(input.diagnosis);

    // 2. Cryptographic Digital Signature (HMAC-SHA256)
    const signaturePayload = `${consultation.id}:${doctor.id}:${JSON.stringify(input.medications)}`;
    const digitalSignature = crypto
      .createHmac('sha256', config.JWT_SECRET)
      .update(signaturePayload)
      .digest('hex');

    // 3. Persist Prescription
    const prescription = await this.prescriptionRepo.create({
      consultationId: consultation.id,
      encryptedDiagnosis,
      medications: input.medications,
      digitalSignature,
    });

    // 4. Mark consultation as COMPLETED
    await this.consultationRepo.updateStatus(consultation.id, 'COMPLETED');

    logger.info({ prescriptionId: prescription.id, consultationId: consultation.id }, 'Prescription issued');

    return {
      id: prescription.id,
      consultationId: prescription.consultationId,
      diagnosis: input.diagnosis,
      medications: prescription.medications,
      digitalSignature: prescription.digitalSignature,
      issuedAt: prescription.issuedAt,
    };
  }

  public async getPrescriptionByConsultation(
    consultationId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<DecryptedPrescription> {
    const consultation = await this.consultationRepo.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    // Tenancy Check: Patient, Doctor, or Admin
    if (userRole === 'PATIENT' && consultation.patientId !== requestingUserId) {
      throw new ForbiddenError('You are not authorized to view this prescription');
    }

    if (userRole === 'DOCTOR') {
      const doc = await this.doctorRepo.findByUserId(requestingUserId);
      if (!doc || doc.id !== consultation.doctorId) {
        throw new ForbiddenError('You are not authorized to view this prescription');
      }
    }

    const prescription = await this.prescriptionRepo.findByConsultationId(consultationId);
    if (!prescription) {
      throw new NotFoundError('Prescription for consultation', consultationId);
    }

    const diagnosis = CryptoService.decrypt(prescription.encryptedDiagnosis);

    return {
      id: prescription.id,
      consultationId: prescription.consultationId,
      diagnosis,
      medications: prescription.medications,
      digitalSignature: prescription.digitalSignature,
      issuedAt: prescription.issuedAt,
    };
  }
}
