import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env
dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),

  // PostgreSQL
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432').transform(Number),
  DB_USER: z.string().default('amrutam_user'),
  DB_PASSWORD: z.string().default('amrutam_secure_pass'),
  DB_NAME: z.string().default('amrutam_telemedicine'),
  DB_POOL_MAX: z.string().default('20').transform(Number),
  DB_IDLE_TIMEOUT_MILLIS: z.string().default('30000').transform(Number),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_ENABLED: z.string().default('false').transform((val) => val === 'true'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // AES-256-GCM Field-Level Encryption Key (32 bytes = 64 hex characters)
  ENCRYPTION_KEY: z.string().min(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

  // Concurrency & Idempotency
  IDEMPOTENCY_TTL_SECONDS: z.string().default('86400').transform(Number),
  SLOT_RESERVATION_TIMEOUT_MINUTES: z.string().default('10').transform(Number),

  // Observability
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PROMETHEUS_METRICS_ENABLED: z.string().default('true').transform((val) => val === 'true'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const config = parsedEnv.data;
export type Config = z.infer<typeof envSchema>;
