import { Response, NextFunction } from 'express';
import { PaymentService } from './payment.service.js';
import { processPaymentSchema } from './payment.dto.js';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  public processPayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = processPaymentSchema.parse(req.body);
      const result = await this.paymentService.processPayment(req.user!.userId, validated);

      const statusCode = result.bookingConfirmed ? 200 : 402; // 402 Payment Required if failed
      res.status(statusCode).json({
        success: result.bookingConfirmed,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public getByConsultation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.paymentService.getPaymentByConsultation(
        req.params.consultationId as string,
        req.user!.userId,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (err) {
      next(err);
    }
  };
}
