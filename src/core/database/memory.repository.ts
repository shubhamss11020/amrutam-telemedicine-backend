import { v4 as uuidv4 } from 'uuid';
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
import { SlotAlreadyBookedError } from '../errors/index.js';

export class InMemoryStore {
  public static users: Map<string, UserEntity> = new Map();
  public static profiles: Map<string, ProfileEntity> = new Map();
  public static doctors: Map<string, DoctorEntity> = new Map();
  public static slots: Map<string, AvailabilitySlotEntity> = new Map();
  public static consultations: Map<string, ConsultationEntity> = new Map();
  public static prescriptions: Map<string, PrescriptionEntity> = new Map();
  public static payments: Map<string, PaymentEntity> = new Map();
  public static auditLogs: AuditLogEntity[] = [];
  public static idempotencyKeys: Map<string, IdempotencyRecordEntity> = new Map();

  // Mutex lock for atomic slot operations in memory
  private static slotLocks: Set<string> = new Set();

  public static async acquireSlotLock(slotId: string): Promise<boolean> {
    if (this.slotLocks.has(slotId)) return false;
    this.slotLocks.add(slotId);
    return true;
  }

  public static releaseSlotLock(slotId: string): void {
    this.slotLocks.delete(slotId);
  }

  public static clear(): void {
    this.users.clear();
    this.profiles.clear();
    this.doctors.clear();
    this.slots.clear();
    this.consultations.clear();
    this.prescriptions.clear();
    this.payments.clear();
    this.auditLogs = [];
    this.idempotencyKeys.clear();
    this.slotLocks.clear();
  }
}

// 1. User Repository
export class MemoryUserRepository implements IUserRepository {
  async create(
    userData: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>,
    profileData?: Omit<ProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<UserEntity & { profile?: ProfileEntity }> {
    const userId = uuidv4();
    const now = new Date();
    const user: UserEntity = {
      ...userData,
      id: userId,
      createdAt: now,
      updatedAt: now,
    };
    InMemoryStore.users.set(userId, user);

    let profile: ProfileEntity | undefined;
    if (profileData) {
      profile = {
        ...profileData,
        id: uuidv4(),
        userId,
        createdAt: now,
        updatedAt: now,
      };
      InMemoryStore.profiles.set(userId, profile);
    }

    return { ...user, profile };
  }

  async findByEmail(email: string): Promise<(UserEntity & { profile?: ProfileEntity; doctor?: DoctorEntity }) | null> {
    for (const user of InMemoryStore.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        const profile = InMemoryStore.profiles.get(user.id);
        const doctor = Array.from(InMemoryStore.doctors.values()).find((d) => d.userId === user.id);
        return { ...user, profile, doctor };
      }
    }
    return null;
  }

  async findById(id: string): Promise<(UserEntity & { profile?: ProfileEntity; doctor?: DoctorEntity }) | null> {
    const user = InMemoryStore.users.get(id);
    if (!user) return null;
    const profile = InMemoryStore.profiles.get(id);
    const doctor = Array.from(InMemoryStore.doctors.values()).find((d) => d.userId === id);
    return { ...user, profile, doctor };
  }

  async updateMfa(id: string, enabled: boolean): Promise<void> {
    const user = InMemoryStore.users.get(id);
    if (user) {
      user.isMfaEnabled = enabled;
      user.updatedAt = new Date();
    }
  }
}

// 2. Doctor Repository
export class MemoryDoctorRepository implements IDoctorRepository {
  async create(doctorData: Omit<DoctorEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<DoctorEntity> {
    const id = uuidv4();
    const now = new Date();
    const doctor: DoctorEntity = {
      ...doctorData,
      id,
      createdAt: now,
      updatedAt: now,
    };
    InMemoryStore.doctors.set(id, doctor);
    return doctor;
  }

  async findById(id: string): Promise<DoctorEntity | null> {
    return InMemoryStore.doctors.get(id) || null;
  }

  async findByUserId(userId: string): Promise<DoctorEntity | null> {
    for (const doc of InMemoryStore.doctors.values()) {
      if (doc.userId === userId) return doc;
    }
    return null;
  }

  async search(filters: {
    specialization?: string;
    minRating?: number;
    maxFee?: number;
    search?: string;
  }): Promise<DoctorEntity[]> {
    let docs = Array.from(InMemoryStore.doctors.values());

    if (filters.specialization) {
      docs = docs.filter((d) => d.specialization.toLowerCase() === filters.specialization!.toLowerCase());
    }
    if (filters.minRating !== undefined) {
      docs = docs.filter((d) => d.rating >= filters.minRating!);
    }
    if (filters.maxFee !== undefined) {
      docs = docs.filter((d) => d.consultationFee <= filters.maxFee!);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      docs = docs.filter((d) => d.fullName.toLowerCase().includes(term) || d.specialization.toLowerCase().includes(term));
    }

    return docs;
  }

  async getAll(): Promise<DoctorEntity[]> {
    return Array.from(InMemoryStore.doctors.values());
  }
}

// 3. Slot Repository (Concurrency Protection)
export class MemorySlotRepository implements ISlotRepository {
  async createBatch(
    slotsData: Array<Omit<AvailabilitySlotEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>>
  ): Promise<AvailabilitySlotEntity[]> {
    const created: AvailabilitySlotEntity[] = [];
    const now = new Date();
    for (const data of slotsData) {
      const id = uuidv4();
      const slot: AvailabilitySlotEntity = {
        ...data,
        id,
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      InMemoryStore.slots.set(id, slot);
      created.push(slot);
    }
    return created;
  }

  async findAvailable(doctorId: string, fromDate?: Date, toDate?: Date): Promise<AvailabilitySlotEntity[]> {
    let slots = Array.from(InMemoryStore.slots.values()).filter((s) => s.doctorId === doctorId && s.status === 'AVAILABLE');

    if (fromDate) {
      slots = slots.filter((s) => new Date(s.startTime) >= fromDate);
    }
    if (toDate) {
      slots = slots.filter((s) => new Date(s.endTime) <= toDate);
    }

    return slots.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  async findById(id: string): Promise<AvailabilitySlotEntity | null> {
    return InMemoryStore.slots.get(id) || null;
  }

  /**
   * Atomic lock and reservation mechanism simulating PostgreSQL 'SELECT ... FOR UPDATE'
   */
  async lockAndReserveSlot(slotId: string, reservedUntil: Date): Promise<AvailabilitySlotEntity> {
    const acquired = await InMemoryStore.acquireSlotLock(slotId);
    if (!acquired) {
      throw new SlotAlreadyBookedError(slotId);
    }

    try {
      const slot = InMemoryStore.slots.get(slotId);
      if (!slot) {
        throw new Error(`Slot '${slotId}' not found`);
      }

      if (slot.status !== 'AVAILABLE') {
        throw new SlotAlreadyBookedError(slotId);
      }

      slot.status = 'RESERVED';
      slot.reservedUntil = reservedUntil;
      slot.version += 1;
      slot.updatedAt = new Date();

      return { ...slot };
    } finally {
      InMemoryStore.releaseSlotLock(slotId);
    }
  }

  async confirmBooking(slotId: string): Promise<AvailabilitySlotEntity> {
    const slot = InMemoryStore.slots.get(slotId);
    if (!slot) throw new Error(`Slot '${slotId}' not found`);

    slot.status = 'BOOKED';
    slot.reservedUntil = undefined;
    slot.version += 1;
    slot.updatedAt = new Date();
    return { ...slot };
  }

  async releaseSlot(slotId: string): Promise<AvailabilitySlotEntity> {
    const slot = InMemoryStore.slots.get(slotId);
    if (!slot) throw new Error(`Slot '${slotId}' not found`);

    slot.status = 'AVAILABLE';
    slot.reservedUntil = undefined;
    slot.version += 1;
    slot.updatedAt = new Date();
    return { ...slot };
  }

  async releaseExpiredSlots(now: Date): Promise<number> {
    let count = 0;
    for (const slot of InMemoryStore.slots.values()) {
      if (slot.status === 'RESERVED' && slot.reservedUntil && slot.reservedUntil <= now) {
        slot.status = 'AVAILABLE';
        slot.reservedUntil = undefined;
        slot.version += 1;
        slot.updatedAt = new Date();
        count++;
      }
    }
    return count;
  }
}

// 4. Consultation Repository
export class MemoryConsultationRepository implements IConsultationRepository {
  async create(data: Omit<ConsultationEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConsultationEntity> {
    const id = uuidv4();
    const now = new Date();
    const consultation: ConsultationEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    InMemoryStore.consultations.set(id, consultation);
    return consultation;
  }

  async findById(id: string): Promise<ConsultationEntity | null> {
    return InMemoryStore.consultations.get(id) || null;
  }

  async findByPatientId(patientId: string): Promise<ConsultationEntity[]> {
    return Array.from(InMemoryStore.consultations.values())
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByDoctorId(doctorId: string, status?: ConsultationStatus): Promise<ConsultationEntity[]> {
    return Array.from(InMemoryStore.consultations.values())
      .filter((c) => c.doctorId === doctorId && (!status || c.status === status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateStatus(id: string, status: ConsultationStatus, notes?: string): Promise<ConsultationEntity> {
    const consultation = InMemoryStore.consultations.get(id);
    if (!consultation) throw new Error(`Consultation '${id}' not found`);

    consultation.status = status;
    if (notes !== undefined) consultation.doctorNotes = notes;
    consultation.updatedAt = new Date();
    return { ...consultation };
  }

  async count(): Promise<number> {
    return InMemoryStore.consultations.size;
  }
}

// 5. Prescription Repository
export class MemoryPrescriptionRepository implements IPrescriptionRepository {
  async create(data: Omit<PrescriptionEntity, 'id' | 'issuedAt'>): Promise<PrescriptionEntity> {
    const id = uuidv4();
    const prescription: PrescriptionEntity = {
      ...data,
      id,
      issuedAt: new Date(),
    };
    InMemoryStore.prescriptions.set(id, prescription);
    return prescription;
  }

  async findByConsultationId(consultationId: string): Promise<PrescriptionEntity | null> {
    for (const p of InMemoryStore.prescriptions.values()) {
      if (p.consultationId === consultationId) return p;
    }
    return null;
  }

  async findById(id: string): Promise<PrescriptionEntity | null> {
    return InMemoryStore.prescriptions.get(id) || null;
  }
}

// 6. Payment Repository
export class MemoryPaymentRepository implements IPaymentRepository {
  async create(data: Omit<PaymentEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentEntity> {
    const id = uuidv4();
    const now = new Date();
    const payment: PaymentEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    InMemoryStore.payments.set(id, payment);
    return payment;
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    return InMemoryStore.payments.get(id) || null;
  }

  async findByTransactionRef(txRef: string): Promise<PaymentEntity | null> {
    for (const p of InMemoryStore.payments.values()) {
      if (p.transactionRef === txRef) return p;
    }
    return null;
  }

  async findByConsultationId(consultationId: string): Promise<PaymentEntity | null> {
    for (const p of InMemoryStore.payments.values()) {
      if (p.consultationId === consultationId) return p;
    }
    return null;
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<PaymentEntity> {
    const payment = InMemoryStore.payments.get(id);
    if (!payment) throw new Error(`Payment '${id}' not found`);

    payment.status = status;
    payment.updatedAt = new Date();
    return { ...payment };
  }
}

// 7. Audit Repository
export class MemoryAuditRepository implements IAuditRepository {
  async log(entry: Omit<AuditLogEntity, 'id' | 'createdAt'>): Promise<AuditLogEntity> {
    const log: AuditLogEntity = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date(),
    };
    InMemoryStore.auditLogs.unshift(log); // newest first
    return log;
  }

  async query(filters: { userId?: string; resource?: string; limit?: number }): Promise<AuditLogEntity[]> {
    let logs = InMemoryStore.auditLogs;
    if (filters.userId) logs = logs.filter((l) => l.userId === filters.userId);
    if (filters.resource) logs = logs.filter((l) => l.resource === filters.resource);
    return logs.slice(0, filters.limit || 50);
  }
}

// 8. Idempotency Repository
export class MemoryIdempotencyRepository implements IIdempotencyRepository {
  async find(key: string): Promise<IdempotencyRecordEntity | null> {
    const record = InMemoryStore.idempotencyKeys.get(key);
    if (!record) return null;
    if (new Date() > record.expiresAt) {
      InMemoryStore.idempotencyKeys.delete(key);
      return null;
    }
    return record;
  }

  async lockKey(key: string, userId?: string, ttlSeconds = 86400): Promise<boolean> {
    const existing = await this.find(key);
    if (existing) {
      return false; // Key already locked or resolved
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    InMemoryStore.idempotencyKeys.set(key, {
      key,
      userId,
      status: 'IN_PROGRESS',
      createdAt: now,
      expiresAt,
    });
    return true;
  }

  async resolveKey(key: string, statusCode: number, responseBody: any): Promise<void> {
    const record = InMemoryStore.idempotencyKeys.get(key);
    if (record) {
      record.status = 'RESOLVED';
      record.statusCode = statusCode;
      record.responseBody = responseBody;
    }
  }

  async cleanExpired(): Promise<number> {
    const now = new Date();
    let cleaned = 0;
    for (const [key, record] of InMemoryStore.idempotencyKeys.entries()) {
      if (now > record.expiresAt) {
        InMemoryStore.idempotencyKeys.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// 9. Analytics Repository
export class MemoryAnalyticsRepository implements IAnalyticsRepository {
  async getMetrics(): Promise<{
    totalConsultations: number;
    completedConsultations: number;
    cancelledConsultations: number;
    totalRevenue: number;
    totalDoctors: number;
    totalPatients: number;
    dailyVolume: Array<{ date: string; count: number }>;
  }> {
    const consultations = Array.from(InMemoryStore.consultations.values());
    const totalConsultations = consultations.length;
    const completedConsultations = consultations.filter((c) => c.status === 'COMPLETED').length;
    const cancelledConsultations = consultations.filter((c) => c.status === 'CANCELLED').length;

    const payments = Array.from(InMemoryStore.payments.values()).filter((p) => p.status === 'SUCCESS');
    const totalRevenue = payments.reduce((acc, curr) => acc + Number(curr.amount), 0);

    const totalDoctors = InMemoryStore.doctors.size;
    const totalPatients = Array.from(InMemoryStore.users.values()).filter((u) => u.role === 'PATIENT').length;

    // Daily volume grouping
    const volumeMap: Record<string, number> = {};
    for (const c of consultations) {
      const dateStr = c.createdAt.toISOString().split('T')[0]!;
      volumeMap[dateStr] = (volumeMap[dateStr] || 0) + 1;
    }

    const dailyVolume = Object.entries(volumeMap).map(([date, count]) => ({ date, count }));

    return {
      totalConsultations,
      completedConsultations,
      cancelledConsultations,
      totalRevenue,
      totalDoctors,
      totalPatients,
      dailyVolume,
    };
  }
}
