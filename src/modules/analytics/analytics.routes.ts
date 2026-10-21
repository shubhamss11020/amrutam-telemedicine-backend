import { Router, Response, NextFunction } from 'express';
import { container } from '../../core/container/index.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export function createAnalyticsRouter(): Router {
  const router = Router();

  // Admin Analytics Dashboard
  router.get(
    '/dashboard',
    authenticate,
    requireRole('ADMIN'),
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const metrics = await container.analyticsRepository.getMetrics();
        res.status(200).json({
          success: true,
          data: metrics,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
