import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.js';
import { container } from '../core/container/index.js';
import { ValidationError, IdempotencyConflictError } from '../core/errors/index.js';
import { idempotencyCounter } from '../core/metrics/index.js';
import { logger } from '../core/logging/logger.js';

export interface IdempotencyOptions {
  required?: boolean;
}

export function idempotency(options: IdempotencyOptions = { required: true }) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to write mutations (POST, PUT, PATCH, DELETE)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const key = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;

    if (!key) {
      if (options.required) {
        return next(
          new ValidationError(
            'Missing required header: "Idempotency-Key". Write operations require an idempotency key to prevent duplicate processing.'
          )
        );
      }
      return next();
    }

    try {
      // 1. Check if key already exists
      const existing = await container.idempotencyRepository.find(key);

      if (existing) {
        if (existing.status === 'RESOLVED') {
          idempotencyCounter.inc({ outcome: 'REPLAY_CACHE' });
          logger.info({ key }, '⚡ Idempotent request replayed from cache');

          res.setHeader('X-Idempotency-Status', 'REPLAYED');
          res.setHeader('X-Idempotency-Key', key);
          res.status(existing.statusCode || 200).json(existing.responseBody);
          return;
        }

        if (existing.status === 'IN_PROGRESS') {
          idempotencyCounter.inc({ outcome: 'CONFLICT_LOCKED' });
          logger.warn({ key }, '⚠️ Idempotent request currently in progress');
          return next(new IdempotencyConflictError(key));
        }
      }

      // 2. Lock the key for processing
      const locked = await container.idempotencyRepository.lockKey(key, req.user?.userId);
      if (!locked) {
        idempotencyCounter.inc({ outcome: 'CONFLICT_LOCKED' });
        return next(new IdempotencyConflictError(key));
      }

      idempotencyCounter.inc({ outcome: 'NEW_PROCESSED' });
      res.setHeader('X-Idempotency-Key', key);
      res.setHeader('X-Idempotency-Status', 'PROCESSED');

      // 3. Intercept response to capture and resolve the idempotency record
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      let saved = false;
      const saveResponse = async (body: any) => {
        if (saved) return;
        saved = true;

        // Only cache successful or client error responses (don't cache 5xx server crashes)
        if (res.statusCode < 500) {
          try {
            await container.idempotencyRepository.resolveKey(key, res.statusCode, body);
            logger.debug({ key, statusCode: res.statusCode }, 'Saved idempotency response cache');
          } catch (err) {
            logger.error({ err, key }, 'Failed to persist idempotency resolution');
          }
        }
      };

      res.json = (body: any): Response => {
        saveResponse(body);
        return originalJson(body);
      };

      res.send = (body: any): Response => {
        try {
          const parsed = typeof body === 'string' ? JSON.parse(body) : body;
          saveResponse(parsed);
        } catch {
          saveResponse({ raw: body });
        }
        return originalSend(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
