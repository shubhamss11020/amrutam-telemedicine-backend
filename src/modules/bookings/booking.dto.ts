import { z } from 'zod';

export const createBookingSchema = z.object({
  slotId: z.string().uuid('Valid slotId UUID required'),
  symptoms: z.string().min(3, 'Please describe symptoms (at least 3 characters)'),
});

export const updateConsultationStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  doctorNotes: z.string().optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateConsultationStatusInput = z.infer<typeof updateConsultationStatusSchema>;
