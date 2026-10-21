// Re-export all domain models from the dedicated models module
export * from '../../models/index.js';

import {
  UserModel,
  ProfileModel,
  DoctorModel,
  AvailabilitySlotModel,
  ConsultationModel,
  PrescriptionModel,
  PaymentModel,
  AuditLogModel,
  IdempotencyModel,
} from '../../models/index.js';

// Entity aliases for Clean Architecture naming conventions
export type UserEntity = UserModel;
export type ProfileEntity = ProfileModel;
export type DoctorEntity = DoctorModel;
export type AvailabilitySlotEntity = AvailabilitySlotModel;
export type ConsultationEntity = ConsultationModel;
export type PrescriptionEntity = PrescriptionModel;
export type PaymentEntity = PaymentModel;
export type AuditLogEntity = AuditLogModel;
export type IdempotencyRecordEntity = IdempotencyModel;

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
