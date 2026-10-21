import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { container } from '../../core/container/index.js';
import { authenticate, requireRole } from '../../middlewares/auth.middleware.js';
import { idempotency } from '../../middlewares/idempotency.middleware.js';

export function createPaymentRouter(): Router {
  const router = Router();
  const service = new PaymentService(
    container.paymentRepository,
    container.consultationRepository,
    container.slotRepository
  );
  const controller = new PaymentController(service);

  // Process payment capture (Protected with Idempotency-Key)
  router.post(
    '/process',
    authenticate,
    requireRole('PATIENT'),
    idempotency({ required: true }),
    controller.processPayment
  );

  // Get payment status for a consultation
  router.get(
    '/consultation/:consultationId',
    authenticate,
    controller.getByConsultation
  );

  return router;
}
