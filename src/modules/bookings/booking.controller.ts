import { Response, NextFunction } from 'express';
import { BookingService } from './booking.service.js';
import { createBookingSchema, updateConsultationStatusSchema } from './booking.dto.js';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  public createBooking = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = createBookingSchema.parse(req.body);
      const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;

      const result = await this.bookingService.bookConsultation(req.user!.userId, validated, idempotencyKey);

      res.status(201).json({
        success: true,
        message: 'Slot reserved successfully. Please complete payment within 10 minutes.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const consultation = await this.bookingService.getConsultationById(
        req.params.id as string,
        req.user!.userId,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: consultation,
      });
    } catch (err) {
      next(err);
    }
  };

  public getMyConsultations = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user!.role === 'DOCTOR') {
        const list = await this.bookingService.getDoctorConsultations(req.user!.userId);
        res.status(200).json({ success: true, count: list.length, data: list });
      } else {
        const list = await this.bookingService.getPatientConsultations(req.user!.userId);
        res.status(200).json({ success: true, count: list.length, data: list });
      }
    } catch (err) {
      next(err);
    }
  };

  public updateStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = updateConsultationStatusSchema.parse(req.body);
      const updated = await this.bookingService.updateStatus(
        req.params.id as string,
        req.user!.userId,
        validated.status,
        validated.doctorNotes
      );

      res.status(200).json({
        success: true,
        message: `Consultation status changed to ${validated.status}`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };
}
