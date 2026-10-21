import client from 'prom-client';
import { config } from '../config/index.js';

// Create a Registry which registers the metrics
export const metricsRegistry = new client.Registry();

// Add default recommended metrics (CPU, Memory, Event Loop lag, GC)
if (config.PROMETHEUS_METRICS_ENABLED) {
  client.collectDefaultMetrics({
    register: metricsRegistry,
    prefix: 'amrutam_',
  });
}

// HTTP Request Duration Histogram (tuned for p95 <200ms reads, <500ms writes)
export const httpRequestDurationHistogram = new client.Histogram({
  name: 'amrutam_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0, 5.0],
  registers: [metricsRegistry],
});

// Total HTTP Requests Counter
export const httpRequestsTotalCounter = new client.Counter({
  name: 'amrutam_http_requests_total',
  help: 'Total count of processed HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

// Slot Booking Operations Counter
export const slotBookingCounter = new client.Counter({
  name: 'amrutam_slot_booking_attempts_total',
  help: 'Total number of booking attempts classified by result',
  labelNames: ['status'], // 'SUCCESS', 'CONFLICT_ALREADY_BOOKED', 'ERROR'
  registers: [metricsRegistry],
});

// Idempotency Layer Counter
export const idempotencyCounter = new client.Counter({
  name: 'amrutam_idempotency_operations_total',
  help: 'Idempotency key resolutions and replays',
  labelNames: ['outcome'], // 'NEW_PROCESSED', 'REPLAY_CACHE', 'CONFLICT_LOCKED'
  registers: [metricsRegistry],
});

// Active In-Progress Consultations Gauge
export const activeConsultationsGauge = new client.Gauge({
  name: 'amrutam_active_consultations',
  help: 'Current number of active ongoing consultations',
  registers: [metricsRegistry],
});

// Database Query Duration Histogram
export const dbQueryDurationHistogram = new client.Histogram({
  name: 'amrutam_db_query_duration_seconds',
  help: 'Database query execution time in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
  registers: [metricsRegistry],
});
