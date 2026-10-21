import { Request, Response, NextFunction } from 'express';
import { config } from '../core/config/index.js';
import { RateLimitExceededError } from '../core/errors/index.js';

interface ClientWindow {
  count: number;
  resetTime: number;
}

const memoryRateLimitStore = new Map<string, ClientWindow>();

// Periodic cleanup of expired rate limit keys
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of memoryRateLimitStore.entries()) {
    if (now > window.resetTime) {
      memoryRateLimitStore.delete(key);
    }
  }
}, 60000).unref();

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
}

export function rateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests || config.RATE_LIMIT_MAX_REQUESTS;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : (req.ip || req.socket.remoteAddress || 'anonymous');

    const now = Date.now();
    let clientWindow = memoryRateLimitStore.get(key);

    if (!clientWindow || now > clientWindow.resetTime) {
      clientWindow = {
        count: 1,
        resetTime: now + windowMs,
      };
      memoryRateLimitStore.set(key, clientWindow);
    } else {
      clientWindow.count++;
    }

    const remaining = Math.max(0, maxRequests - clientWindow.count);
    const retryAfter = Math.ceil((clientWindow.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(clientWindow.resetTime / 1000));

    if (clientWindow.count > maxRequests) {
      res.setHeader('Retry-After', retryAfter);
      return next(new RateLimitExceededError(retryAfter));
    }

    next();
  };
}
