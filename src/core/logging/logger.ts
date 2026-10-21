import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { config } from '../config/index.js';

export interface RequestContext {
  requestId: string;
  userId?: string;
  userRole?: string;
  ip?: string;
  method?: string;
  path?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

const pinoOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'amrutam-telemedicine-backend',
    env: config.NODE_ENV,
  },
  mixin() {
    const context = requestContextStorage.getStore();
    return context ? { ...context } : {};
  },
};

// Use pretty print in development, JSON in production
export const logger = config.NODE_ENV === 'development'
  ? pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    })
  : pino(pinoOptions);
