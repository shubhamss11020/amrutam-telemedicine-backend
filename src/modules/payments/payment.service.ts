import {
  IPaymentRepository,
  IConsultationRepository,
  ISlotRepository,
} from '../../core/database/repositories.interface.js';
import { PaymentEntity } from '../../core/types/index.js';
import { ProcessPaymentInput } from './payment.dto.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../core/errors/index.js';
import { logger } from '../../core/logging/logger.js';

export class PaymentService {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly consultationRepo: IConsultationRepository,
    private readonly slotRepo: ISlotRepository
  ) {}

  /**
   * Saga Orchestrator: Captures payment and atomically confirms or compensates the booking
   */
  public async processPayment(
    patientId: string,
    input: ProcessPaymentInput
  ): Promise<{ payment: PaymentEntity; bookingConfirmed: boolean; message: string }> {
    const consultation = await this.consultationRepo.findById(input.consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', input.consultationId);
    }

    if (consultation.patientId !== patientId) {
      throw new ForbiddenError('You can only pay for your own consultations');
    }

    if (consultation.status !== 'PENDING') {
      throw new ConflictError(`Consultation is not in PENDING state (Current: ${consultation.status})`);
    }

    let payment = await this.paymentRepo.findByConsultationId(consultation.id);
    if (!payment) {
      throw new NotFoundError('Payment order for consultation', consultation.id);
    }

    if (payment.status === 'SUCCESS') {
      return {
        payment,
        bookingConfirmed: true,
        message: 'Payment has already been processed successfully.',
      };
    }

    // Simulate failure or execute success
    if (input.simulateFailure) {
      logger.warn({ consultationId: consultation.id }, 'Payment simulation failed. Executing Saga Compensating rollback...');

      // Saga Compensation 1: Mark Payment as FAILED
      payment = await this.paymentRepo.updateStatus(payment.id, 'FAILED');

      // Saga Compensation 2: Release the reserved availability slot back to AVAILABLE
      await this.slotRepo.releaseSlot(consultation.slotId);

      // Saga Compensation 3: Mark Consultation as CANCELLED
      await this.consultationRepo.updateStatus(consultation.id, 'CANCELLED', 'Auto-cancelled due to payment failure');

      return {
        payment,
        bookingConfirmed: false,
        message: 'Payment failed. The reserved slot has been released back to available.',
      };
    }

    // Success path:
    logger.info({ consultationId: consultation.id }, 'Payment captured successfully. Confirming booking saga...');

    // Step 1: Update payment status to SUCCESS
    payment = await this.paymentRepo.updateStatus(payment.id, 'SUCCESS');

    // Step 2: Transition slot from RESERVED to BOOKED
    await this.slotRepo.confirmBooking(consultation.slotId);

    // Step 3: Transition consultation from PENDING to CONFIRMED
    await this.consultationRepo.updateStatus(consultation.id, 'CONFIRMED');

    return {
      payment,
      bookingConfirmed: true,
      message: 'Payment confirmed! Your doctor consultation is officially booked.',
    };
  }

  public async getPaymentByConsultation(
    consultationId: string,
    userId: string,
    role: string
  ): Promise<PaymentEntity> {
    const consultation = await this.consultationRepo.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError('Consultation', consultationId);
    }

    if (role === 'PATIENT' && consultation.patientId !== userId) {
      throw new ForbiddenError('Unauthorized to view this payment');
    }

    const payment = await this.paymentRepo.findByConsultationId(consultationId);
    if (!payment) {
      throw new NotFoundError('Payment for consultation', consultationId);
    }

    return payment;
  }
}
