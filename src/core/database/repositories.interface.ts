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

export interface IUserRepository {
  create(
    user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt'>,
    profile?: Omit<ProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<UserEntity & { profile?: ProfileEntity }>;
  findByEmail(email: string): Promise<(UserEntity & { profile?: ProfileEntity; doctor?: DoctorEntity }) | null>;
  findById(id: string): Promise<(UserEntity & { profile?: ProfileEntity; doctor?: DoctorEntity }) | null>;
  updateMfa(id: string, enabled: boolean): Promise<void>;
}

export interface IDoctorRepository {
  create(doctor: Omit<DoctorEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<DoctorEntity>;
  findById(id: string): Promise<DoctorEntity | null>;
  findByUserId(userId: string): Promise<DoctorEntity | null>;
  search(filters: {
    specialization?: string;
    minRating?: number;
    maxFee?: number;
    search?: string;
  }): Promise<DoctorEntity[]>;
  getAll(): Promise<DoctorEntity[]>;
}

export interface ISlotRepository {
  createBatch(slots: Array<Omit<AvailabilitySlotEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>>): Promise<AvailabilitySlotEntity[]>;
  findAvailable(doctorId: string, fromDate?: Date, toDate?: Date): Promise<AvailabilitySlotEntity[]>;
  findById(id: string): Promise<AvailabilitySlotEntity | null>;
  lockAndReserveSlot(slotId: string, reservedUntil: Date): Promise<AvailabilitySlotEntity>;
  confirmBooking(slotId: string): Promise<AvailabilitySlotEntity>;
  releaseSlot(slotId: string): Promise<AvailabilitySlotEntity>;
  releaseExpiredSlots(now: Date): Promise<number>;
}

export interface IConsultationRepository {
  create(consultation: Omit<ConsultationEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConsultationEntity>;
  findById(id: string): Promise<ConsultationEntity | null>;
  findByPatientId(patientId: string): Promise<ConsultationEntity[]>;
  findByDoctorId(doctorId: string, status?: ConsultationStatus): Promise<ConsultationEntity[]>;
  updateStatus(id: string, status: ConsultationStatus, notes?: string): Promise<ConsultationEntity>;
  count(): Promise<number>;
}

export interface IPrescriptionRepository {
  create(prescription: Omit<PrescriptionEntity, 'id' | 'issuedAt'>): Promise<PrescriptionEntity>;
  findByConsultationId(consultationId: string): Promise<PrescriptionEntity | null>;
  findById(id: string): Promise<PrescriptionEntity | null>;
}

export interface IPaymentRepository {
  create(payment: Omit<PaymentEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentEntity>;
  findById(id: string): Promise<PaymentEntity | null>;
  findByTransactionRef(txRef: string): Promise<PaymentEntity | null>;
  findByConsultationId(consultationId: string): Promise<PaymentEntity | null>;
  updateStatus(id: string, status: PaymentStatus): Promise<PaymentEntity>;
}

export interface IAuditRepository {
  log(entry: Omit<AuditLogEntity, 'id' | 'createdAt'>): Promise<AuditLogEntity>;
  query(filters: { userId?: string; resource?: string; limit?: number }): Promise<AuditLogEntity[]>;
}

export interface IIdempotencyRepository {
  find(key: string): Promise<IdempotencyRecordEntity | null>;
  lockKey(key: string, userId?: string, ttlSeconds?: number): Promise<boolean>;
  resolveKey(key: string, statusCode: number, responseBody: any): Promise<void>;
  cleanExpired(): Promise<number>;
}

export interface IAnalyticsRepository {
  getMetrics(): Promise<{
    totalConsultations: number;
    completedConsultations: number;
    cancelledConsultations: number;
    totalRevenue: number;
    totalDoctors: number;
    totalPatients: number;
    dailyVolume: Array<{ date: string; count: number }>;
  }>;
}
