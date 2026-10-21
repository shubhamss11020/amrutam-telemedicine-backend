export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, details?: unknown, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly errorCode: string = 'RESOURCE_NOT_FOUND';

  constructor(resource: string, identifier?: string | number) {
    super(identifier ? `${resource} with identifier '${identifier}' was not found.` : `${resource} not found.`);
  }
}

export class ConflictError extends AppError {
  public readonly statusCode = 409;
  public override errorCode: string = 'RESOURCE_CONFLICT';

  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

export class SlotAlreadyBookedError extends ConflictError {
  public override errorCode: string = 'SLOT_ALREADY_BOOKED';

  constructor(slotId: string) {
    super(`The requested availability slot '${slotId}' is already booked or reserved.`, { slotId });
  }
}

export class IdempotencyConflictError extends ConflictError {
  public override errorCode: string = 'IDEMPOTENCY_IN_PROGRESS';

  constructor(key: string) {
    super(`A request with Idempotency-Key '${key}' is currently being processed. Please retry shortly.`, { key });
  }
}

export class UnauthorizedError extends AppError {
  public readonly statusCode = 401;
  public readonly errorCode: string = 'UNAUTHORIZED';

  constructor(message = 'Authentication required to access this resource.') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  public readonly statusCode = 403;
  public readonly errorCode = 'FORBIDDEN';

  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
  }
}

export class ValidationError extends AppError {
  public readonly statusCode = 400;
  public readonly errorCode: string = 'VALIDATION_ERROR';

  constructor(message = 'Invalid request input parameters.', details?: unknown) {
    super(message, details);
  }
}

export class RateLimitExceededError extends AppError {
  public readonly statusCode = 429;
  public readonly errorCode: string = 'RATE_LIMIT_EXCEEDED';

  constructor(retryAfterSeconds = 60) {
    super(`Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`, { retryAfterSeconds });
  }
}

export class DatabaseError extends AppError {
  public readonly statusCode = 500;
  public readonly errorCode: string = 'DATABASE_ERROR';

  constructor(message = 'A database operation failed.', details?: unknown) {
    super(message, details, true);
  }
}
