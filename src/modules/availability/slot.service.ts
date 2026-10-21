import { ISlotRepository, IDoctorRepository } from '../../core/database/repositories.interface.js';
import { AvailabilitySlotEntity } from '../../core/types/index.js';
import { GenerateSlotsInput, QuerySlotsInput } from './slot.dto.js';
import { NotFoundError, ValidationError } from '../../core/errors/index.js';
import { logger } from '../../core/logging/logger.js';

export class SlotService {
  constructor(
    private readonly slotRepo: ISlotRepository,
    private readonly doctorRepo: IDoctorRepository
  ) {}

  public async generateDoctorSlots(
    doctorId: string,
    input: GenerateSlotsInput
  ): Promise<AvailabilitySlotEntity[]> {
    const doctor = await this.doctorRepo.findById(doctorId);
    if (!doctor) {
      throw new NotFoundError('Doctor', doctorId);
    }

    if (input.startHour >= input.endHour) {
      throw new ValidationError('startHour must be earlier than endHour');
    }

    const [year, month, day] = input.date.split('-').map(Number) as [number, number, number];
    const slotsToCreate: Array<Omit<AvailabilitySlotEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>> = [];

    const durationMs = input.slotDurationMinutes * 60 * 1000;
    const dayStart = new Date(Date.UTC(year, month - 1, day, input.startHour, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, input.endHour, 0, 0));

    let current = dayStart.getTime();
    while (current + durationMs <= dayEnd.getTime()) {
      const startTime = new Date(current);
      const endTime = new Date(current + durationMs);

      slotsToCreate.push({
        doctorId,
        startTime,
        endTime,
        status: 'AVAILABLE',
      });

      current += durationMs;
    }

    const createdSlots = await this.slotRepo.createBatch(slotsToCreate);
    logger.info({ doctorId, count: createdSlots.length, date: input.date }, 'Doctor slots generated');
    return createdSlots;
  }

  public async getAvailableSlots(query: QuerySlotsInput): Promise<AvailabilitySlotEntity[]> {
    const fromDate = query.fromDate ? new Date(query.fromDate) : undefined;
    const toDate = query.toDate ? new Date(query.toDate) : undefined;

    // Trigger cleanup of any expired reservations before query
    await this.slotRepo.releaseExpiredSlots(new Date());

    return this.slotRepo.findAvailable(query.doctorId, fromDate, toDate);
  }

  public async getSlotById(slotId: string): Promise<AvailabilitySlotEntity> {
    const slot = await this.slotRepo.findById(slotId);
    if (!slot) {
      throw new NotFoundError('Availability slot', slotId);
    }
    return slot;
  }
}
