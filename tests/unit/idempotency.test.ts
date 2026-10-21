import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryIdempotencyRepository, InMemoryStore } from '../../src/core/database/memory.repository.js';

describe('Idempotency Engine (Zero-Duplicate Write Guarantee)', () => {
  let repo: MemoryIdempotencyRepository;

  beforeEach(() => {
    InMemoryStore.clear();
    repo = new MemoryIdempotencyRepository();
  });

  it('should successfully lock an idempotency key on first attempt', async () => {
    const key = 'idem-unique-key-001';
    const locked = await repo.lockKey(key, 'user-123', 3600);
    expect(locked).toBe(true);

    const record = await repo.find(key);
    expect(record).not.toBeNull();
    expect(record?.status).toBe('IN_PROGRESS');
  });

  it('should refuse to lock an already active idempotency key (prevent concurrent replay)', async () => {
    const key = 'idem-unique-key-002';
    const firstAttempt = await repo.lockKey(key, 'user-123', 3600);
    expect(firstAttempt).toBe(true);

    const secondAttempt = await repo.lockKey(key, 'user-123', 3600);
    expect(secondAttempt).toBe(false);
  });

  it('should store and retrieve cached response when resolved', async () => {
    const key = 'idem-unique-key-003';
    await repo.lockKey(key, 'user-123', 3600);

    const responsePayload = { success: true, bookingId: 'book-999', fee: 500 };
    await repo.resolveKey(key, 201, responsePayload);

    const record = await repo.find(key);
    expect(record?.status).toBe('RESOLVED');
    expect(record?.statusCode).toBe(201);
    expect(record?.responseBody).toEqual(responsePayload);
  });
});
