import { Router } from 'express';
import { SlotController } from './slot.controller.js';
import { SlotService } from './slot.service.js';
import { container } from '../../core/container/index.js';
import { authenticate, requireRole } from '../../middlewares/auth.middleware.js';

export function createSlotRouter(): Router {
  const router = Router();
  const service = new SlotService(container.slotRepository, container.doctorRepository);
  const controller = new SlotController(service);

  // Doctors and Admins can publish slots
  router.post('/', authenticate, requireRole('DOCTOR', 'ADMIN'), controller.generateSlots);

  // Public/Patients can search available slots
  router.get('/available', controller.getAvailableSlots);

  return router;
}
