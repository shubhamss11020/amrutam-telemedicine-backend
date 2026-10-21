import { Request, Response, NextFunction } from 'express';
import { SlotService } from './slot.service.js';
import { generateSlotsSchema, querySlotsSchema } from './slot.dto.js';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { ForbiddenError, ValidationError } from '../../core/errors/index.js';
import { container } from '../../core/container/index.js';

export class SlotController {
  constructor(private readonly slotService: SlotService) {}

  public generateSlots = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = generateSlotsSchema.parse(req.body);

      let targetDoctorId = validated.doctorId;

      // If user is a DOCTOR, default target to their doctor ID
      if (req.user!.role === 'DOCTOR') {
        const doctorProfile = await container.doctorRepository.findByUserId(req.user!.userId);
        if (!doctorProfile) {
          throw new ForbiddenError('No doctor profile found for current user');
        }
        targetDoctorId = doctorProfile.id;
      } else if (req.user!.role !== 'ADMIN') {
        throw new ForbiddenError('Only doctors and admins can publish availability slots');
      }

      if (!targetDoctorId) {
        throw new ValidationError('doctorId must be provided');
      }

      const slots = await this.slotService.generateDoctorSlots(targetDoctorId, validated);
      res.status(201).json({
        success: true,
        count: slots.length,
        data: slots,
      });
    } catch (err) {
      next(err);
    }
  };

  public getAvailableSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = querySlotsSchema.parse(req.query);
      const slots = await this.slotService.getAvailableSlots(query);
      res.status(200).json({
        success: true,
        count: slots.length,
        data: slots,
      });
    } catch (err) {
      next(err);
    }
  };
}
