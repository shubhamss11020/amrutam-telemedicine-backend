import {
  UserEntity,
  ProfileEntity,
  DoctorEntity,
  AvailabilitySlotEntity,
  ConsultationEntity,
  PrescriptionEntity,
  PaymentEntity,
  AuditLogEntity,
  IdempotencyRecordEntity,
  ConsultationStatus,
  PaymentStatus,
} from '../types/index.js';
import {
  IUserRepository,
  IDoctorRepository,
  ISlotRepository,
  IConsultationRepository,
  IPrescriptionRepository,
  IPaymentRepository,
  IAuditRepository,
  IIdempotencyRepository,
  IAnalyticsRepository,
} from './repositories.interface.js';
import { dbService } from './connection.js';
import { SlotAlreadyBookedError } from '../errors/index.js';

export class PostgresUserRepository implements IUserRepository {
  async create(
    userData: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>,
    profileData?: Omit<ProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<UserEntity & { profile?: ProfileEntity }> {
    return dbService.withTransaction(async (client) => {
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, role, is_mfa_enabled)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, password_hash as "passwordHash", role, is_mfa_enabled as "isMfaEnabled", created_at as "createdAt", updated_at as "updatedAt"`,
        [userData.email, userData.passwordHash, userData.role, userData.isMfaEnabled]
      );
      const user = userRes.rows[0] as UserEntity;

      let profile: ProfileEntity | undefined;
      if (profileData) {
        const profRes = await client.query(
          `INSERT INTO profiles (user_id, full_name, phone, emergency_contact, encrypted_medical_history)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id as "userId", full_name as "fullName", phone, emergency_contact as "emergencyContact", encrypted_medical_history as "encryptedMedicalHistory", created_at as "createdAt", updated_at as "updatedAt"`,
          [
            user.id,
            profileData.fullName,
            profileData.phone || null,
            profileData.emergencyContact || null,
            profileData.encryptedMedicalHistory || null,
          ]
        );
        profile = profRes.rows[0] as ProfileEntity;
      }

      return { ...user, profile };
    });
  }

  async findByEmail(email: string): Promise<(UserEntity & { profile?: ProfileEntity; doctor?: DoctorEntity }) | null> {
    const res = await dbService.query(
      `SELECT u.id, u.email, u.password_hash as "passwordHash", u.role, u.is_mfa_enabled as "isMfaEnabled", u.created_at as "createdAt", u.updated_at as "updatedAt",
              p.id as "prof_id", p.full_name as "prof_fullName", p.phone as "prof_phone", p.emergency_contact as "prof_emergencyContact",
              d.id as "doc_id", d.specialization as "doc_specialization", d.experience_years as "doc_experienceYears", d.consultation_fee as "doc_consultationFee", d.rating as "doc_rating"
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const user: UserEntity = {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role,
      isMfaEnabled: row.isMfaEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    const profile: ProfileEntity | undefined = row.prof_id
      ? {
          id: row.prof_id,
          userId: row.id,
          fullName: row.prof_fullName,
          phone: row.prof_phone,
          emergencyContact: row.prof_emergencyContact,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : undefined;

    const doctor: DoctorEntity | undefined = row.doc_id
      ? {
          id: row.doc_id,
          userId: row.id,
          fullName: row.prof_fullName || 'Dr. ' + row.email.split('@')[0],
          specialization: row.doc_specialization,
          experienceYears: row.doc_experienceYears,
          consultationFee: Number(row.doc_consultationFee),
          rating: Number(row.doc_rating),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : undefined;

    return { ...user, profile, doctor };
  }

  async findById(id: string): Promise<(UserEntity & { profile?: ProfileEntity; doctor?: DoctorEntity }) | null> {
    const res = await dbService.query(
      `SELECT u.id, u.email, u.password_hash as "passwordHash", u.role, u.is_mfa_enabled as "isMfaEnabled", u.created_at as "createdAt", u.updated_at as "updatedAt",
              p.id as "prof_id", p.full_name as "prof_fullName", p.phone as "prof_phone", p.emergency_contact as "prof_emergencyContact",
              d.id as "doc_id", d.specialization as "doc_specialization", d.experience_years as "doc_experienceYears", d.consultation_fee as "doc_consultationFee", d.rating as "doc_rating"
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role,
      isMfaEnabled: row.isMfaEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      profile: row.prof_id
        ? {
            id: row.prof_id,
            userId: row.id,
            fullName: row.prof_fullName,
            phone: row.prof_phone,
            emergencyContact: row.prof_emergencyContact,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        : undefined,
      doctor: row.doc_id
        ? {
            id: row.doc_id,
            userId: row.id,
            fullName: row.prof_fullName || 'Dr. ' + row.email.split('@')[0],
            specialization: row.doc_specialization,
            experienceYears: row.doc_experienceYears,
            consultationFee: Number(row.doc_consultationFee),
            rating: Number(row.doc_rating),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        : undefined,
    };
  }

  async updateMfa(id: string, enabled: boolean): Promise<void> {
    await dbService.query(`UPDATE users SET is_mfa_enabled = $1, updated_at = NOW() WHERE id = $2`, [enabled, id]);
  }
}

export class PostgresDoctorRepository implements IDoctorRepository {
  async create(doctorData: Omit<DoctorEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<DoctorEntity> {
    const res = await dbService.query(
      `INSERT INTO doctors (user_id, specialization, experience_years, consultation_fee, rating, bio)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id as "userId", specialization, experience_years as "experienceYears", consultation_fee as "consultationFee", rating, bio, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        doctorData.userId,
        doctorData.specialization,
        doctorData.experienceYears,
        doctorData.consultationFee,
        doctorData.rating,
        doctorData.bio || null,
      ]
    );
    const row = res.rows[0];
    return {
      ...row,
      consultationFee: Number(row.consultationFee),
      rating: Number(row.rating),
      fullName: doctorData.fullName,
    };
  }

  async findById(id: string): Promise<DoctorEntity | null> {
    const res = await dbService.query(
      `SELECT d.id, d.user_id as "userId", p.full_name as "fullName", d.specialization, d.experience_years as "experienceYears", d.consultation_fee as "consultationFee", d.rating, d.bio, d.created_at as "createdAt", d.updated_at as "updatedAt"
       FROM doctors d
       JOIN profiles p ON p.user_id = d.user_id
       WHERE d.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      consultationFee: Number(row.consultationFee),
      rating: Number(row.rating),
    };
  }

  async findByUserId(userId: string): Promise<DoctorEntity | null> {
    const res = await dbService.query(
      `SELECT d.id, d.user_id as "userId", p.full_name as "fullName", d.specialization, d.experience_years as "experienceYears", d.consultation_fee as "consultationFee", d.rating, d.bio, d.created_at as "createdAt", d.updated_at as "updatedAt"
       FROM doctors d
       JOIN profiles p ON p.user_id = d.user_id
       WHERE d.user_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      consultationFee: Number(row.consultationFee),
      rating: Number(row.rating),
    };
  }

  async search(filters: {
    specialization?: string;
    minRating?: number;
    maxFee?: number;
    search?: string;
  }): Promise<DoctorEntity[]> {
    let query = `
      SELECT d.id, d.user_id as "userId", p.full_name as "fullName", d.specialization, d.experience_years as "experienceYears", d.consultation_fee as "consultationFee", d.rating, d.bio, d.created_at as "createdAt", d.updated_at as "updatedAt"
      FROM doctors d
      JOIN profiles p ON p.user_id = d.user_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters.specialization) {
      query += ` AND LOWER(d.specialization) = LOWER($${idx++})`;
      params.push(filters.specialization);
    }
    if (filters.minRating !== undefined) {
      query += ` AND d.rating >= $${idx++}`;
      params.push(filters.minRating);
    }
    if (filters.maxFee !== undefined) {
      query += ` AND d.consultation_fee <= $${idx++}`;
      params.push(filters.maxFee);
    }
    if (filters.search) {
      query += ` AND (LOWER(p.full_name) LIKE $${idx} OR LOWER(d.specialization) LIKE $${idx})`;
      params.push(`%${filters.search.toLowerCase()}%`);
      idx++;
    }

    query += ` ORDER BY d.rating DESC, d.experience_years DESC LIMIT 50`;
    const res = await dbService.query(query, params);
    return res.rows.map((row: any) => ({
      ...row,
      consultationFee: Number(row.consultationFee),
      rating: Number(row.rating),
    }));
  }

  async getAll(): Promise<DoctorEntity[]> {
    return this.search({});
  }
}

export class PostgresSlotRepository implements ISlotRepository {
  async createBatch(
    slotsData: Array<Omit<AvailabilitySlotEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>>
  ): Promise<AvailabilitySlotEntity[]> {
    const results: AvailabilitySlotEntity[] = [];
    for (const slot of slotsData) {
      const res = await dbService.query(
        `INSERT INTO availability_slots (doctor_id, start_time, end_time, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (doctor_id, start_time) DO NOTHING
         RETURNING id, doctor_id as "doctorId", start_time as "startTime", end_time as "endTime", status, version, reserved_until as "reservedUntil", created_at as "createdAt", updated_at as "updatedAt"`,
        [slot.doctorId, slot.startTime, slot.endTime, slot.status]
      );
      if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
  }

  async findAvailable(doctorId: string, fromDate?: Date, toDate?: Date): Promise<AvailabilitySlotEntity[]> {
    let query = `
      SELECT id, doctor_id as "doctorId", start_time as "startTime", end_time as "endTime", status, version, reserved_until as "reservedUntil", created_at as "createdAt", updated_at as "updatedAt"
      FROM availability_slots
      WHERE doctor_id = $1 AND status = 'AVAILABLE'
    `;
    const params: any[] = [doctorId];
    let idx = 2;

    if (fromDate) {
      query += ` AND start_time >= $${idx++}`;
      params.push(fromDate);
    }
    if (toDate) {
      query += ` AND end_time <= $${idx++}`;
      params.push(toDate);
    }

    query += ` ORDER BY start_time ASC`;
    const res = await dbService.query(query, params);
    return res.rows;
  }

  async findById(id: string): Promise<AvailabilitySlotEntity | null> {
    const res = await dbService.query(
      `SELECT id, doctor_id as "doctorId", start_time as "startTime", end_time as "endTime", status, version, reserved_until as "reservedUntil", created_at as "createdAt", updated_at as "updatedAt"
       FROM availability_slots
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * Airtight Concurrency Engine:
   * Uses PostgreSQL pessimistic row-level locking (SELECT ... FOR UPDATE)
   */
  async lockAndReserveSlot(slotId: string, reservedUntil: Date): Promise<AvailabilitySlotEntity> {
    return dbService.withTransaction(async (client) => {
      // 1. Acquire exclusive row lock
      const lockRes = await client.query(
        `SELECT id, status, version FROM availability_slots WHERE id = $1 FOR UPDATE`,
        [slotId]
      );

      if (lockRes.rows.length === 0) {
        throw new Error(`Slot '${slotId}' not found`);
      }

      const current = lockRes.rows[0];
      if (current.status !== 'AVAILABLE') {
        throw new SlotAlreadyBookedError(slotId);
      }

      // 2. Transition status with optimistic lock version increment
      const updateRes = await client.query(
        `UPDATE availability_slots
         SET status = 'RESERVED', reserved_until = $2, version = version + 1, updated_at = NOW()
         WHERE id = $1
         RETURNING id, doctor_id as "doctorId", start_time as "startTime", end_time as "endTime", status, version, reserved_until as "reservedUntil", created_at as "createdAt", updated_at as "updatedAt"`,
        [slotId, reservedUntil]
      );

      return updateRes.rows[0];
    });
  }

  async confirmBooking(slotId: string): Promise<AvailabilitySlotEntity> {
    const res = await dbService.query(
      `UPDATE availability_slots
       SET status = 'BOOKED', reserved_until = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, doctor_id as "doctorId", start_time as "startTime", end_time as "endTime", status, version, reserved_until as "reservedUntil", created_at as "createdAt", updated_at as "updatedAt"`,
      [slotId]
    );
    return res.rows[0];
  }

  async releaseSlot(slotId: string): Promise<AvailabilitySlotEntity> {
    const res = await dbService.query(
      `UPDATE availability_slots
       SET status = 'AVAILABLE', reserved_until = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, doctor_id as "doctorId", start_time as "startTime", end_time as "endTime", status, version, reserved_until as "reservedUntil", created_at as "createdAt", updated_at as "updatedAt"`,
      [slotId]
    );
    return res.rows[0];
  }

  async releaseExpiredSlots(now: Date): Promise<number> {
    const res = await dbService.query(
      `UPDATE availability_slots
       SET status = 'AVAILABLE', reserved_until = NULL, version = version + 1, updated_at = NOW()
       WHERE status = 'RESERVED' AND reserved_until <= $1`,
      [now]
    );
    return res.rowCount;
  }
}

export class PostgresConsultationRepository implements IConsultationRepository {
  async create(data: Omit<ConsultationEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConsultationEntity> {
    const res = await dbService.query(
      `INSERT INTO consultations (patient_id, doctor_id, slot_id, status, encrypted_symptoms, doctor_notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, patient_id as "patientId", doctor_id as "doctorId", slot_id as "slotId", status, encrypted_symptoms as "encryptedSymptoms", doctor_notes as "doctorNotes", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.patientId, data.doctorId, data.slotId, data.status, data.encryptedSymptoms || null, data.doctorNotes || null]
    );
    return res.rows[0];
  }

  async findById(id: string): Promise<ConsultationEntity | null> {
    const res = await dbService.query(
      `SELECT id, patient_id as "patientId", doctor_id as "doctorId", slot_id as "slotId", status, encrypted_symptoms as "encryptedSymptoms", doctor_notes as "doctorNotes", created_at as "createdAt", updated_at as "updatedAt"
       FROM consultations
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findByPatientId(patientId: string): Promise<ConsultationEntity[]> {
    const res = await dbService.query(
      `SELECT id, patient_id as "patientId", doctor_id as "doctorId", slot_id as "slotId", status, encrypted_symptoms as "encryptedSymptoms", doctor_notes as "doctorNotes", created_at as "createdAt", updated_at as "updatedAt"
       FROM consultations
       WHERE patient_id = $1
       ORDER BY created_at DESC`,
      [patientId]
    );
    return res.rows;
  }

  async findByDoctorId(doctorId: string, status?: ConsultationStatus): Promise<ConsultationEntity[]> {
    let query = `
      SELECT id, patient_id as "patientId", doctor_id as "doctorId", slot_id as "slotId", status, encrypted_symptoms as "encryptedSymptoms", doctor_notes as "doctorNotes", created_at as "createdAt", updated_at as "updatedAt"
      FROM consultations
      WHERE doctor_id = $1
    `;
    const params: any[] = [doctorId];
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC`;

    const res = await dbService.query(query, params);
    return res.rows;
  }

  async updateStatus(id: string, status: ConsultationStatus, notes?: string): Promise<ConsultationEntity> {
    const res = await dbService.query(
      `UPDATE consultations
       SET status = $1, doctor_notes = COALESCE($2, doctor_notes), updated_at = NOW()
       WHERE id = $3
       RETURNING id, patient_id as "patientId", doctor_id as "doctorId", slot_id as "slotId", status, encrypted_symptoms as "encryptedSymptoms", doctor_notes as "doctorNotes", created_at as "createdAt", updated_at as "updatedAt"`,
      [status, notes || null, id]
    );
    return res.rows[0];
  }

  async count(): Promise<number> {
    const res = await dbService.query(`SELECT COUNT(*) as count FROM consultations`);
    return Number(res.rows[0].count);
  }
}

export class PostgresPrescriptionRepository implements IPrescriptionRepository {
  async create(data: Omit<PrescriptionEntity, 'id' | 'issuedAt'>): Promise<PrescriptionEntity> {
    const res = await dbService.query(
      `INSERT INTO prescriptions (consultation_id, encrypted_diagnosis, medications, digital_signature)
       VALUES ($1, $2, $3, $4)
       RETURNING id, consultation_id as "consultationId", encrypted_diagnosis as "encryptedDiagnosis", medications, digital_signature as "digitalSignature", issued_at as "issuedAt"`,
      [data.consultationId, data.encryptedDiagnosis, JSON.stringify(data.medications), data.digitalSignature]
    );
    return res.rows[0];
  }

  async findByConsultationId(consultationId: string): Promise<PrescriptionEntity | null> {
    const res = await dbService.query(
      `SELECT id, consultation_id as "consultationId", encrypted_diagnosis as "encryptedDiagnosis", medications, digital_signature as "digitalSignature", issued_at as "issuedAt"
       FROM prescriptions
       WHERE consultation_id = $1`,
      [consultationId]
    );
    return res.rows[0] || null;
  }

  async findById(id: string): Promise<PrescriptionEntity | null> {
    const res = await dbService.query(
      `SELECT id, consultation_id as "consultationId", encrypted_diagnosis as "encryptedDiagnosis", medications, digital_signature as "digitalSignature", issued_at as "issuedAt"
       FROM prescriptions
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }
}

export class PostgresPaymentRepository implements IPaymentRepository {
  async create(data: Omit<PaymentEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentEntity> {
    const res = await dbService.query(
      `INSERT INTO payments (consultation_id, amount, currency, status, transaction_ref, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, consultation_id as "consultationId", amount, currency, status, transaction_ref as "transactionRef", idempotency_key as "idempotencyKey", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.consultationId, data.amount, data.currency, data.status, data.transactionRef, data.idempotencyKey || null]
    );
    const row = res.rows[0];
    return { ...row, amount: Number(row.amount) };
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    const res = await dbService.query(
      `SELECT id, consultation_id as "consultationId", amount, currency, status, transaction_ref as "transactionRef", idempotency_key as "idempotencyKey", created_at as "createdAt", updated_at as "updatedAt"
       FROM payments WHERE id = $1`,
      [id]
    );
    if (!res.rows[0]) return null;
    return { ...res.rows[0], amount: Number(res.rows[0].amount) };
  }

  async findByTransactionRef(txRef: string): Promise<PaymentEntity | null> {
    const res = await dbService.query(
      `SELECT id, consultation_id as "consultationId", amount, currency, status, transaction_ref as "transactionRef", idempotency_key as "idempotencyKey", created_at as "createdAt", updated_at as "updatedAt"
       FROM payments WHERE transaction_ref = $1`,
      [txRef]
    );
    if (!res.rows[0]) return null;
    return { ...res.rows[0], amount: Number(res.rows[0].amount) };
  }

  async findByConsultationId(consultationId: string): Promise<PaymentEntity | null> {
    const res = await dbService.query(
      `SELECT id, consultation_id as "consultationId", amount, currency, status, transaction_ref as "transactionRef", idempotency_key as "idempotencyKey", created_at as "createdAt", updated_at as "updatedAt"
       FROM payments WHERE consultation_id = $1`,
      [consultationId]
    );
    if (!res.rows[0]) return null;
    return { ...res.rows[0], amount: Number(res.rows[0].amount) };
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<PaymentEntity> {
    const res = await dbService.query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, consultation_id as "consultationId", amount, currency, status, transaction_ref as "transactionRef", idempotency_key as "idempotencyKey", created_at as "createdAt", updated_at as "updatedAt"`,
      [status, id]
    );
    return { ...res.rows[0], amount: Number(res.rows[0].amount) };
  }
}

export class PostgresAuditRepository implements IAuditRepository {
  async log(entry: Omit<AuditLogEntity, 'id' | 'createdAt'>): Promise<AuditLogEntity> {
    const res = await dbService.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id as "userId", action, resource, resource_id as "resourceId", ip_address as "ipAddress", user_agent as "userAgent", details, created_at as "createdAt"`,
      [
        entry.userId || null,
        entry.action,
        entry.resource,
        entry.resourceId,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.details ? JSON.stringify(entry.details) : null,
      ]
    );
    return res.rows[0];
  }

  async query(filters: { userId?: string; resource?: string; limit?: number }): Promise<AuditLogEntity[]> {
    let query = `
      SELECT id, user_id as "userId", action, resource, resource_id as "resourceId", ip_address as "ipAddress", user_agent as "userAgent", details, created_at as "createdAt"
      FROM audit_logs
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters.userId) {
      query += ` AND user_id = $${idx++}`;
      params.push(filters.userId);
    }
    if (filters.resource) {
      query += ` AND resource = $${idx++}`;
      params.push(filters.resource);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(filters.limit || 50);

    const res = await dbService.query(query, params);
    return res.rows;
  }
}

export class PostgresIdempotencyRepository implements IIdempotencyRepository {
  async find(key: string): Promise<IdempotencyRecordEntity | null> {
    const res = await dbService.query(
      `SELECT key, user_id as "userId", status, status_code as "statusCode", response_body as "responseBody", created_at as "createdAt", expires_at as "expiresAt"
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );
    return res.rows[0] || null;
  }

  async lockKey(key: string, userId?: string, ttlSeconds = 86400): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const res = await dbService.query(
      `INSERT INTO idempotency_keys (key, user_id, status, expires_at)
       VALUES ($1, $2, 'IN_PROGRESS', $3)
       ON CONFLICT (key) DO NOTHING`,
      [key, userId || null, expiresAt]
    );
    return res.rowCount > 0;
  }

  async resolveKey(key: string, statusCode: number, responseBody: any): Promise<void> {
    await dbService.query(
      `UPDATE idempotency_keys
       SET status = 'RESOLVED', status_code = $1, response_body = $2
       WHERE key = $3`,
      [statusCode, JSON.stringify(responseBody), key]
    );
  }

  async cleanExpired(): Promise<number> {
    const res = await dbService.query(`DELETE FROM idempotency_keys WHERE expires_at <= NOW()`);
    return res.rowCount;
  }
}

export class PostgresAnalyticsRepository implements IAnalyticsRepository {
  async getMetrics(): Promise<{
    totalConsultations: number;
    completedConsultations: number;
    cancelledConsultations: number;
    totalRevenue: number;
    totalDoctors: number;
    totalPatients: number;
    dailyVolume: Array<{ date: string; count: number }>;
  }> {
    const totalConsultationsRes = await dbService.query(`SELECT COUNT(*) FROM consultations`);
    const completedRes = await dbService.query(`SELECT COUNT(*) FROM consultations WHERE status = 'COMPLETED'`);
    const cancelledRes = await dbService.query(`SELECT COUNT(*) FROM consultations WHERE status = 'CANCELLED'`);
    const revenueRes = await dbService.query(`SELECT COALESCE(SUM(amount), 0) as rev FROM payments WHERE status = 'SUCCESS'`);
    const docsRes = await dbService.query(`SELECT COUNT(*) FROM doctors`);
    const patientsRes = await dbService.query(`SELECT COUNT(*) FROM users WHERE role = 'PATIENT'`);
    const volumeRes = await dbService.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM consultations
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      LIMIT 14
    `);

    return {
      totalConsultations: Number(totalConsultationsRes.rows[0].count),
      completedConsultations: Number(completedRes.rows[0].count),
      cancelledConsultations: Number(cancelledRes.rows[0].count),
      totalRevenue: Number(revenueRes.rows[0].rev),
      totalDoctors: Number(docsRes.rows[0].count),
      totalPatients: Number(patientsRes.rows[0].count),
      dailyVolume: volumeRes.rows.map((r: any) => ({
        date: r.date.toISOString ? r.date.toISOString().split('T')[0] : String(r.date),
        count: Number(r.count),
      })),
    };
  }
}
