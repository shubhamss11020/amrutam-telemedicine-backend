import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { container } from '../../core/container/index.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { rateLimiter } from '../../middlewares/rate-limit.middleware.js';

export function createAuthRouter(): Router {
  const router = Router();
  const authService = new AuthService(container.userRepository, container.doctorRepository);
  const controller = new AuthController(authService);

  // Apply tighter rate limiting to login and registration against brute force
  const authRateLimiter = rateLimiter({ windowMs: 60000, maxRequests: 20 });

  router.post('/register', authRateLimiter, controller.register);
  router.post('/login', authRateLimiter, controller.login);
  router.post('/refresh', controller.refreshToken);
  router.get('/me', authenticate, controller.getMe);
  router.post('/mfa/toggle', authenticate, controller.toggleMfa);

  return router;
}
