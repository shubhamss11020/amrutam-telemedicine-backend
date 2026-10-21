import { Response, NextFunction } from 'express';
import { PrescriptionService } from './prescription.service.js';
import { createPrescriptionSchema } from './prescription.dto.js';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export class PrescriptionController {
  constructor(private readonly prescriptionService: PrescriptionService) {}

  public issuePrescription = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = createPrescriptionSchema.parse(req.body);
      const prescription = await this.prescriptionService.issuePrescription(req.user!.userId, validated);

      res.status(201).json({
        success: true,
        message: 'Digital prescription issued successfully',
        data: prescription,
      });
    } catch (err) {
      next(err);
    }
  };

  public getByConsultation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const prescription = await this.prescriptionService.getPrescriptionByConsultation(
        req.params.consultationId as string,
        req.user!.userId,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: prescription,
      });
    } catch (err) {
      next(err);
    }
  };
}
