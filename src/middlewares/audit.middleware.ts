import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.js';
import { container } from '../core/container/index.js';
import { logger } from '../core/logging/logger.js';

export function auditLog(action: string, resource: string, getResourceId?: (req: AuthenticatedRequest) => string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Intercept finish event to ensure we only log what actually occurred
    res.on('finish', () => {
      // Don't log failed unauthorized attempts in PHI audit (logged separately in security logs)
      if (res.statusCode >= 400 && res.statusCode !== 404) return;

      const rawResourceId = getResourceId ? getResourceId(req) : req.params.id || 'N/A';
      const resourceId = Array.isArray(rawResourceId) ? rawResourceId[0] || 'N/A' : rawResourceId;
      const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').toString();
      const rawUserAgent = req.headers['user-agent'];
      const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] || 'unknown' : rawUserAgent || 'unknown';

      container.auditRepository
        .log({
          userId: req.user?.userId,
          action,
          resource,
          resourceId,
          ipAddress,
          userAgent,
          details: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
          },
        })
        .catch((err) => {
          logger.error({ err, resource, resourceId }, 'Failed to persist healthcare audit log');
        });
    });

    next();
  };
}
