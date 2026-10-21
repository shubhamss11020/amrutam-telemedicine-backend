import { dbService } from '../database/connection.js';
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
} from '../database/repositories.interface.js';
import {
  MemoryUserRepository,
  MemoryDoctorRepository,
  MemorySlotRepository,
  MemoryConsultationRepository,
  MemoryPrescriptionRepository,
  MemoryPaymentRepository,
  MemoryAuditRepository,
  MemoryIdempotencyRepository,
  MemoryAnalyticsRepository,
} from '../database/memory.repository.js';
import {
  PostgresUserRepository,
  PostgresDoctorRepository,
  PostgresSlotRepository,
  PostgresConsultationRepository,
  PostgresPrescriptionRepository,
  PostgresPaymentRepository,
  PostgresAuditRepository,
  PostgresIdempotencyRepository,
  PostgresAnalyticsRepository,
} from '../database/postgres.repository.js';

export class ServiceContainer {
  private static instance: ServiceContainer;

  public readonly userRepository: IUserRepository;
  public readonly doctorRepository: IDoctorRepository;
  public readonly slotRepository: ISlotRepository;
  public readonly consultationRepository: IConsultationRepository;
  public readonly prescriptionRepository: IPrescriptionRepository;
  public readonly paymentRepository: IPaymentRepository;
  public readonly auditRepository: IAuditRepository;
  public readonly idempotencyRepository: IIdempotencyRepository;
  public readonly analyticsRepository: IAnalyticsRepository;

  private constructor() {
    // If PostgreSQL pool is established, use Postgres repositories; otherwise fallback seamlessly to memory
    if (dbService.isDbConnected) {
      this.userRepository = new PostgresUserRepository();
      this.doctorRepository = new PostgresDoctorRepository();
      this.slotRepository = new PostgresSlotRepository();
      this.consultationRepository = new PostgresConsultationRepository();
      this.prescriptionRepository = new PostgresPrescriptionRepository();
      this.paymentRepository = new PostgresPaymentRepository();
      this.auditRepository = new PostgresAuditRepository();
      this.idempotencyRepository = new PostgresIdempotencyRepository();
      this.analyticsRepository = new PostgresAnalyticsRepository();
    } else {
      this.userRepository = new MemoryUserRepository();
      this.doctorRepository = new MemoryDoctorRepository();
      this.slotRepository = new MemorySlotRepository();
      this.consultationRepository = new MemoryConsultationRepository();
      this.prescriptionRepository = new MemoryPrescriptionRepository();
      this.paymentRepository = new MemoryPaymentRepository();
      this.auditRepository = new MemoryAuditRepository();
      this.idempotencyRepository = new MemoryIdempotencyRepository();
      this.analyticsRepository = new MemoryAnalyticsRepository();
    }
  }

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * Allows re-initializing container (e.g. after DB connection or in test suites)
   */
  public static resetInstance(): ServiceContainer {
    ServiceContainer.instance = new ServiceContainer();
    return ServiceContainer.instance;
  }
}

export const container = ServiceContainer.getInstance();
