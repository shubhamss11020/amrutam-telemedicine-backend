import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { fileURLToPath } from 'url';

import { config } from './core/config/index.js';
import { correlationMiddleware } from './middlewares/correlation.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { metricsRegistry } from './core/metrics/index.js';
import { dbService } from './core/database/connection.js';
import { NotFoundError } from './core/errors/index.js';

// Route imports
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createDoctorRouter } from './modules/doctors/doctor.routes.js';
import { createSlotRouter } from './modules/availability/slot.routes.js';
import { createBookingRouter } from './modules/bookings/booking.routes.js';
import { createPrescriptionRouter } from './modules/prescriptions/prescription.routes.js';
import { createPaymentRouter } from './modules/payments/payment.routes.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import { createAnalyticsRouter } from './modules/analytics/analytics.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // 1. Security & Optimization Middlewares
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows Swagger UI to load inline assets
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: '*', credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 2. Correlation Tracking & Metrics
  app.use(correlationMiddleware);

  // 3. System Observability & Health Probes
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      service: 'amrutam-telemedicine-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get('/health/ready', (_req: Request, res: Response) => {
    const isDbReady = dbService.isDbConnected;
    const memoryUsage = process.memoryUsage();

    const isHealthy = true; // App functions with Postgres or In-Memory fallback

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'READY' : 'DEGRADED',
      database: isDbReady ? 'CONNECTED (PostgreSQL)' : 'IN-MEMORY STANDALONE MODE',
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Prometheus /metrics endpoint
  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      const metrics = await metricsRegistry.metrics();
      res.end(metrics);
    } catch (err) {
      res.status(500).end(err);
    }
  });

  // 4. Interactive OpenAPI / Swagger Documentation
  try {
    const openapiPath = path.resolve(__dirname, '../docs/openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      const file = fs.readFileSync(openapiPath, 'utf8');
      const swaggerDocument = YAML.parse(file);
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    }
  } catch (err) {
    console.warn('Could not load OpenAPI docs at /api/docs:', err);
  }

  // 5. API Module Mounting
  const apiRouter = express.Router();
  apiRouter.use('/auth', createAuthRouter());
  apiRouter.use('/doctors', createDoctorRouter());
  apiRouter.use('/slots', createSlotRouter());
  apiRouter.use('/bookings', createBookingRouter());
  apiRouter.use('/prescriptions', createPrescriptionRouter());
  apiRouter.use('/payments', createPaymentRouter());
  apiRouter.use('/audit', createAuditRouter());
  apiRouter.use('/analytics', createAnalyticsRouter());

  app.use(config.API_PREFIX, apiRouter);

  // 6. 404 Handler for Unmatched Routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
  });

  // 7. Standardized Error Handler (RFC 7807)
  app.use(errorHandler);

  return app;
}
