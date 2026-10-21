import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContextStorage } from '../core/logging/logger.js';
import { httpRequestDurationHistogram, httpRequestsTotalCounter } from '../core/metrics/index.js';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  res.setHeader('x-request-id', requestId);

  const start = process.hrtime();

  // Wrap execution inside AsyncLocalStorage context
  requestContextStorage.run(
    {
      requestId,
      ip: req.ip || req.socket.remoteAddress,
      method: req.method,
      path: req.originalUrl,
    },
    () => {
      res.on('finish', () => {
        const diff = process.hrtime(start);
        const durationSeconds = diff[0] + diff[1] / 1e9;

        const route = req.route?.path || req.baseUrl || req.path || 'unknown';
        const statusCode = res.statusCode.toString();

        httpRequestDurationHistogram.observe(
          { method: req.method, route, status_code: statusCode },
          durationSeconds
        );

        httpRequestsTotalCounter.inc({
          method: req.method,
          route,
          status_code: statusCode,
        });
      });

      next();
    }
  );
}
