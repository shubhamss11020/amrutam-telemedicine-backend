export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'BOOKED' | 'CANCELLED';

export interface AvailabilitySlotModel {
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
