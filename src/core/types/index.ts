export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'BOOKED' | 'CANCELLED';

export type ConsultationStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export type IdempotencyStatus = 'IN_PROGRESS' | 'RESOLVED';

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isMfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileEntity {
  id: string;
  userId: string;
  fullName: string;
  phone?: string;
  emergencyContact?: string;
  encryptedMedicalHistory?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DoctorEntity {
  id: string;
  userId: string;
  fullName: string;
  specialization: string;
  experienceYears: number;
  consultationFee: number;
  rating: number;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilitySlotEntity {
  id: string;
  doctorId: string;
  startTime: Date;
  endTime: Date;
  status: SlotStatus;
  version: number;
  reservedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsultationEntity {
  id: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  status: ConsultationStatus;
  encryptedSymptoms?: string;
  doctorNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrescriptionEntity {
  id: string;
  consultationId: string;
  encryptedDiagnosis: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    instructions?: string;
  }>;
  digitalSignature: string;
  issuedAt: Date;
}

export interface PaymentEntity {
  id: string;
  consultationId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionRef: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogEntity {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  createdAt: Date;
}

export interface IdempotencyRecordEntity {
  key: string;
  userId?: string;
  status: IdempotencyStatus;
  statusCode?: number;
  responseBody?: any;
  createdAt: Date;
  expiresAt: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
