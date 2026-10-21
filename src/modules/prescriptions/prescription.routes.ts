import { Router } from 'express';
import { PrescriptionController } from './prescription.controller.js';
import { PrescriptionService } from './prescription.service.js';
import { container } from '../../core/container/index.js';
import { authenticate, requireRole } from '../../middlewares/auth.middleware.js';
import { idempotency } from '../../middlewares/idempotency.middleware.js';
import { auditLog } from '../../middlewares/audit.middleware.js';

export function createPrescriptionRouter(): Router {
  const router = Router();
  const service = new PrescriptionService(
    container.prescriptionRepository,
    container.consultationRepository,
    container.doctorRepository
  );
  const controller = new PrescriptionController(service);

  // Doctors issue digital prescriptions
  router.post(
    '/',
    authenticate,
    requireRole('DOCTOR'),
    idempotency({ required: true }),
    controller.issuePrescription
  );

  // Read prescription by consultation (with HIPAA Audit Log)
  router.get(
    '/consultation/:consultationId',
    authenticate,
    auditLog('READ_PRESCRIPTION', 'PRESCRIPTION', (req) => req.params.consultationId as string),
    controller.getByConsultation
  );

  return router;
}
