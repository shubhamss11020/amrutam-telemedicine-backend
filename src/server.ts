import { createApp } from './app.js';
import { config } from './core/config/index.js';
import { logger } from './core/logging/logger.js';
import { dbService } from './core/database/connection.js';
import { ServiceContainer, container } from './core/container/index.js';
import { seedDatabase } from './core/database/seed.js';

async function bootstrap() {
  logger.info({ env: config.NODE_ENV, port: config.PORT }, 'Starting Amrutam Telemedicine Backend...');

  // 1. Establish database connection (or gracefully fallback to memory mode)
  await dbService.connect();
  ServiceContainer.resetInstance();

  // 2. Auto-seed initial doctors, slots, and test users if in development
  if (config.NODE_ENV === 'development') {
    try {
      await seedDatabase();
    } catch (err) {
      logger.warn({ err }, 'Seed script skipped or already populated');
    }
  }

  // 3. Periodic Background Workers
  // Job A: Release expired slot reservations (e.g. held > 10 mins without payment)
  const slotCleanupInterval = setInterval(async () => {
    try {
      const released = await container.slotRepository.releaseExpiredSlots(new Date());
      if (released > 0) {
        logger.info({ released }, '🧹 Background Worker: Released expired slot reservations');
      }
    } catch (err) {
      logger.error({ err }, 'Slot reservation cleanup worker error');
    }
  }, 60000).unref();

  // Job B: Clean expired idempotency records
  const idempotencyCleanupInterval = setInterval(async () => {
    try {
      const cleaned = await container.idempotencyRepository.cleanExpired();
      if (cleaned > 0) {
        logger.debug({ cleaned }, '🧹 Background Worker: Cleaned expired idempotency keys');
      }
    } catch (err) {
      logger.error({ err }, 'Idempotency cleanup worker error');
    }
  }, 3600000).unref();

  // 4. Start HTTP Server
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`🚀 Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
    logger.info(`📚 Swagger Documentation: http://localhost:${config.PORT}/api/docs`);
    logger.info(`📊 Prometheus Metrics:   http://localhost:${config.PORT}/metrics`);
    logger.info(`🩺 Health Check:          http://localhost:${config.PORT}/health`);
  });

  // 5. Graceful Shutdown Handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal. Commencing graceful teardown...');

    clearInterval(slotCleanupInterval);
    clearInterval(idempotencyCleanupInterval);

    server.close(async () => {
      logger.info('HTTP server stopped receiving new requests');
      try {
        await dbService.close();
        logger.info('Database connections successfully closed');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during database teardown');
        process.exit(1);
      }
    });

    // Force shutdown if graceful teardown times out (10s)
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcefully exiting...');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, '🔥 Fatal failure during application bootstrap');
  process.exit(1);
});
