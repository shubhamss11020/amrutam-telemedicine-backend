import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { InMemoryStore } from '../../src/core/database/memory.repository.js';

describe('End-to-End Telemedicine Lifecycle (Auth -> Slot -> Booking -> Idempotency -> Saga Payment -> Prescription -> Audit)', () => {
  const app = createApp();

  beforeEach(() => {
    InMemoryStore.clear();
  });

  it('should complete the entire telemedicine lifecycle flawlessly', async () => {
    // ---------------------------------------------------------
    // 1. Register Doctor
    // ---------------------------------------------------------
    const docRegRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'dr.ayush@amrutam.co',
        password: 'DoctorPass2026!',
        role: 'DOCTOR',
        fullName: 'Dr. Ayush Sharma',
        specialization: 'Ayurvedic Kayachikitsa',
        experienceYears: 15,
        consultationFee: 1000,
        bio: 'Senior Ayurvedic Physician',
      });

    expect(docRegRes.status).toBe(201);
    const doctorToken = docRegRes.body.data.tokens.accessToken;
    const doctorId = docRegRes.body.data.user.doctor.id;
    expect(doctorId).toBeDefined();

    // ---------------------------------------------------------
    // 2. Doctor Publishes Availability Slots
    // ---------------------------------------------------------
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0]!;

    const slotGenRes = await request(app)
      .post('/api/v1/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        date: dateStr,
        startHour: 10,
        endHour: 12,
        slotDurationMinutes: 30,
      });

    expect(slotGenRes.status).toBe(201);
    expect(slotGenRes.body.data).toHaveLength(4);
    const targetSlot = slotGenRes.body.data[0];

    // ---------------------------------------------------------
    // 3. Register Patient
    // ---------------------------------------------------------
    const patRegRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'patient.rohit@example.com',
        password: 'PatientPass2026!',
        role: 'PATIENT',
        fullName: 'Rohit Gupta',
        phone: '+919876543210',
      });

    expect(patRegRes.status).toBe(201);
    const patientToken = patRegRes.body.data.tokens.accessToken;
    const patientId = patRegRes.body.data.user.id;

    // ---------------------------------------------------------
    // 4. Search Doctors with Filter
    // ---------------------------------------------------------
    const searchRes = await request(app)
      .get('/api/v1/doctors?specialization=Ayurvedic Kayachikitsa')
      .send();

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].id).toBe(doctorId);

    // ---------------------------------------------------------
    // 5. Patient Books Slot with Idempotency Key
    // ---------------------------------------------------------
    const idempotencyKey = 'idem-e2e-booking-key-1001';

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: targetSlot.id,
        symptoms: 'Experiencing chronic digestive discomfort and insomnia.',
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.data.consultation.status).toBe('PENDING');
    expect(bookingRes.body.data.consultation.decryptedSymptoms).toBe(
      'Experiencing chronic digestive discomfort and insomnia.'
    );
    const consultationId = bookingRes.body.data.consultation.id;

    // ---------------------------------------------------------
    // 6. Test Idempotency Replay (Zero duplicate booking)
    // ---------------------------------------------------------
    const replayRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: targetSlot.id,
        symptoms: 'Experiencing chronic digestive discomfort and insomnia.',
      });

    expect(replayRes.status).toBe(201);
    expect(replayRes.headers['x-idempotency-status']).toBe('REPLAYED');
    expect(replayRes.body.data.consultation.id).toBe(consultationId);

    // ---------------------------------------------------------
    // 7. Saga Payment Confirmation
    // ---------------------------------------------------------
    const paymentRes = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', 'pay-key-2001')
      .send({
        consultationId,
        paymentMethod: 'UPI',
        simulateFailure: false,
      });

    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.data.bookingConfirmed).toBe(true);

    // Verify consultation is now CONFIRMED
    const verifyConsultationRes = await request(app)
      .get(`/api/v1/bookings/${consultationId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send();

    expect(verifyConsultationRes.status).toBe(200);
    expect(verifyConsultationRes.body.data.status).toBe('CONFIRMED');

    // ---------------------------------------------------------
    // 8. Doctor Starts Consultation & Issues Prescription
    // ---------------------------------------------------------
    await request(app)
      .patch(`/api/v1/bookings/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        status: 'IN_PROGRESS',
        doctorNotes: 'Patient consultation in progress via video session.',
      });

    const prescriptionRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('Idempotency-Key', 'rx-key-3001')
      .send({
        consultationId,
        diagnosis: 'Agni Mandya (Weakened Digestive Fire) and Pitta aggravation',
        medications: [
          {
            name: 'Amrutam Triphala Churna',
            dosage: '1 teaspoon',
            frequency: 'Bedtime with warm water',
            durationDays: 30,
            instructions: 'Do not eat anything 1 hour after taking.',
          },
        ],
      });

    expect(prescriptionRes.status).toBe(201);
    expect(prescriptionRes.body.data.digitalSignature).toBeDefined();

    // ---------------------------------------------------------
    // 9. Patient Reads Prescription (Decrypted PHI)
    // ---------------------------------------------------------
    const readRxRes = await request(app)
      .get(`/api/v1/prescriptions/consultation/${consultationId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send();

    expect(readRxRes.status).toBe(200);
    expect(readRxRes.body.data.diagnosis).toBe(
      'Agni Mandya (Weakened Digestive Fire) and Pitta aggravation'
    );
    expect(readRxRes.body.data.medications).toHaveLength(1);

    // ---------------------------------------------------------
    // 10. Observability Probes Check (/health, /metrics)
    // ---------------------------------------------------------
    const healthRes = await request(app).get('/health').send();
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('UP');

    const metricsRes = await request(app).get('/metrics').send();
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.text).toContain('amrutam_http_requests_total');
    expect(metricsRes.text).toContain('amrutam_slot_booking_attempts_total');
  });
});
