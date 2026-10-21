import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { InMemoryStore } from '../../src/core/database/memory.repository.js';
import { container } from '../../src/core/container/index.js';
import { CryptoService } from '../../src/core/security/crypto.js';

describe('Concurrency Engine: Slot Double-Booking Prevention Under High Contention', () => {
  const app = createApp();
  let patientToken: string;
  let doctorId: string;
  let targetSlotId: string;

  beforeEach(async () => {
    InMemoryStore.clear();

    // 1. Create a Doctor
    const docUser = await container.userRepository.create(
      {
        email: 'concurrency.doc@amrutam.co',
        passwordHash: 'hashed',
        role: 'DOCTOR',
        isMfaEnabled: false,
      },
      { fullName: 'Dr. Concurrency Specialist' }
    );

    const docProfile = await container.doctorRepository.create({
      userId: docUser.id,
      fullName: 'Dr. Concurrency Specialist',
      specialization: 'High Concurrency Medicine',
      experienceYears: 10,
      consultationFee: 750,
      rating: 5.0,
    });
    doctorId = docProfile.id;

    // 2. Create a single availability slot
    const slots = await container.slotRepository.createBatch([
      {
        doctorId,
        startTime: new Date('2026-10-25T10:00:00Z'),
        endTime: new Date('2026-10-25T10:30:00Z'),
        status: 'AVAILABLE',
      },
    ]);
    targetSlotId = slots[0]!.id;

    // 3. Create a Patient & Access Token
    const patientUser = await container.userRepository.create(
      {
        email: 'patient.speed@example.com',
        passwordHash: 'hashed',
        role: 'PATIENT',
        isMfaEnabled: false,
      },
      { fullName: 'Speed Tester' }
    );

    patientToken = CryptoService.generateAccessToken({
      userId: patientUser.id,
      role: 'PATIENT',
      email: patientUser.email,
    });
  });

  it('should guarantee that among 10 concurrent booking attempts for the same slot, exactly 1 succeeds and 9 receive clean 409 conflicts', async () => {
    const concurrentAttempts = 10;

    // Fire 10 simultaneous requests to book the exact same slot
    const promises = Array.from({ length: concurrentAttempts }).map((_, index) =>
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', `race-key-${index}-${Date.now()}`)
        .send({
          slotId: targetSlotId,
          symptoms: `Concurrent racing attempt #${index + 1}`,
        })
    );

    const responses = await Promise.all(promises);

    const successResponses = responses.filter((r) => r.status === 201);
    const conflictResponses = responses.filter((r) => r.status === 409);

    // CRITICAL ASSERTION: Exactly 1 booking was created
    expect(successResponses).toHaveLength(1);

    // The other 9 received a clean 409 Conflict
    expect(conflictResponses).toHaveLength(concurrentAttempts - 1);

    for (const conflict of conflictResponses) {
      expect(conflict.body.error.code).toBe('SLOT_ALREADY_BOOKED');
    }

    // Verify database state: slot is RESERVED and only 1 consultation exists
    const slotInDb = await container.slotRepository.findById(targetSlotId);
    expect(slotInDb?.status).toBe('RESERVED');
    expect(InMemoryStore.consultations.size).toBe(1);
  });
});
