import { IDoctorRepository } from '../../core/database/repositories.interface.js';
import { NotFoundError } from '../../core/errors/index.js';
import { DoctorEntity } from '../../core/types/index.js';
import { DoctorSearchParams } from './doctor.dto.js';
import { logger } from '../../core/logging/logger.js';

// Simple in-memory cache for doctor search with 30s TTL
interface CacheEntry {
  data: DoctorEntity[];
  expiresAt: number;
}
const searchCache = new Map<string, CacheEntry>();

export class DoctorService {
  constructor(private readonly doctorRepo: IDoctorRepository) {}

  public async searchDoctors(filters: DoctorSearchParams): Promise<DoctorEntity[]> {
    const cacheKey = JSON.stringify(filters);
    const cached = searchCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      logger.debug({ cacheKey }, 'Doctor search served from cache');
      return cached.data;
    }

    const doctors = await this.doctorRepo.search(filters);

    // Cache results for 30 seconds
    searchCache.set(cacheKey, {
      data: doctors,
      expiresAt: Date.now() + 30000,
    });

    return doctors;
  }

  public async getDoctorById(id: string): Promise<DoctorEntity> {
    const doctor = await this.doctorRepo.findById(id);
    if (!doctor) {
      throw new NotFoundError('Doctor', id);
    }
    return doctor;
  }

  public async getDoctorByUserId(userId: string): Promise<DoctorEntity> {
    const doctor = await this.doctorRepo.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundError('Doctor profile for user', userId);
    }
    return doctor;
  }
}
