import { z } from 'zod';

export const generateSlotsSchema = z.object({
  doctorId: z.string().uuid().optional(), // If not provided, inferred from logged-in doctor
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startHour: z.number().int().min(0).max(23).default(9),
  endHour: z.number().int().min(1).max(24).default(17),
  slotDurationMinutes: z.number().int().min(15).max(120).default(30),
});

export const querySlotsSchema = z.object({
  doctorId: z.string().uuid('Valid doctorId UUID required'),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export type GenerateSlotsInput = z.infer<typeof generateSlotsSchema>;
export type QuerySlotsInput = z.infer<typeof querySlotsSchema>;
