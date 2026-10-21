import { Request, Response, NextFunction } from 'express';
import { CryptoService } from '../core/security/crypto.js';
import { UnauthorizedError, ForbiddenError } from '../core/errors/index.js';
import { UserRole } from '../core/types/index.js';
import { requestContextStorage } from '../core/logging/logger.js';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header. Bearer token required.');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('Bearer token is empty.');
  }

  try {
    const decoded = CryptoService.verifyAccessToken(token);
    req.user = {
      userId: decoded.userId,
      role: decoded.role as UserRole,
      email: decoded.email,
    };

    // Update logging context with authenticated user info
    const currentContext = requestContextStorage.getStore();
    if (currentContext) {
      currentContext.userId = decoded.userId;
      currentContext.userRole = decoded.role;
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access forbidden: required role (${allowedRoles.join(' or ')}), current role (${req.user.role})`
        )
      );
    }

    next();
  };
}
