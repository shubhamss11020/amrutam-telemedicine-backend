import { Router, Response, NextFunction } from 'express';
import { container } from '../../core/container/index.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export function createAuditRouter(): Router {
  const router = Router();

  // Only ADMIN can inspect audit logs (HIPAA Compliance)
  router.get(
    '/',
    authenticate,
    requireRole('ADMIN'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.query.userId as string | undefined;
        const resource = req.query.resource as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

        const logs = await container.auditRepository.query({
          userId,
          resource,
          limit,
        });

        res.status(200).json({
          success: true,
          count: logs.length,
          data: logs,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
