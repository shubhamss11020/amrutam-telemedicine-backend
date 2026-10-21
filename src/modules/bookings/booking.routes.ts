import { Router } from 'express';
import { BookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';
import { container } from '../../core/container/index.js';
import { authenticate, requireRole } from '../../middlewares/auth.middleware.js';
import { idempotency } from '../../middlewares/idempotency.middleware.js';
import { auditLog } from '../../middlewares/audit.middleware.js';

export function createBookingRouter(): Router {
  const router = Router();
  const service = new BookingService(
    container.slotRepository,
    container.consultationRepository,
    container.doctorRepository,
    container.paymentRepository
  );
  const controller = new BookingController(service);

  // Book a consultation (Requires Idempotency-Key and PATIENT role)
  router.post(
    '/',
    authenticate,
    requireRole('PATIENT'),
    idempotency({ required: true }),
    controller.createBooking
  );

  // List consultations for current user (Patient or Doctor)
  router.get('/', authenticate, controller.getMyConsultations);

  // Get specific consultation by ID (with Medical Audit Logging)
  router.get(
    '/:id',
    authenticate,
    auditLog('READ_CONSULTATION', 'CONSULTATION'),
    controller.getById
  );

  // Update status (Doctors only)
  router.patch(
    '/:id/status',
    authenticate,
    requireRole('DOCTOR'),
    controller.updateStatus
  );

  return router;
}
