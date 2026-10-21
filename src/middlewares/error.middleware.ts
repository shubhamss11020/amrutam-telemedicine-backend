import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../core/errors/index.js';
import { logger, requestContextStorage } from '../core/logging/logger.js';
import { config } from '../core/config/index.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const context = requestContextStorage.getStore();
  const requestId = context?.requestId || (res.getHeader('x-request-id') as string) || 'N/A';

  // 1. Handled Domain AppError
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, `Operational Server Error: ${err.message}`);
    } else {
      logger.warn({ err: { name: err.name, message: err.message, code: err.errorCode }, requestId }, `Client Error: ${err.message}`);
    }

    res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details || null,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    logger.warn({ errors: formattedErrors, requestId }, 'Input validation failed');

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request input data',
        details: formattedErrors,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // 3. JSON Syntax Error
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON_BODY',
        message: 'Malformed JSON payload in request body',
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // 4. Unhandled System Exception
  logger.error({ err: { message: err.message, stack: err.stack }, requestId }, '🔥 Critical Unhandled Server Exception');

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.NODE_ENV === 'production' ? 'An internal error occurred. Please contact support.' : err.message,
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
