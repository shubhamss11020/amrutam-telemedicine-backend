import { Router } from 'express';
import { DoctorController } from './doctor.controller.js';
import { DoctorService } from './doctor.service.js';
import { container } from '../../core/container/index.js';

export function createDoctorRouter(): Router {
  const router = Router();
  const service = new DoctorService(container.doctorRepository);
  const controller = new DoctorController(service);

  router.get('/', controller.search);
  router.get('/:id', controller.getById);

  return router;
}
