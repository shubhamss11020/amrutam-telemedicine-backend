import { z } from 'zod';

export const createPrescriptionSchema = z.object({
  consultationId: z.string().uuid('Valid consultationId UUID required'),
  diagnosis: z.string().min(3, 'Diagnosis must be at least 3 characters long'),
  medications: z
    .array(
      z.object({
        name: z.string().min(1, 'Medication name required'),
        dosage: z.string().min(1, 'Dosage instructions required (e.g. 500mg)'),
        frequency: z.string().min(1, 'Frequency required (e.g. Twice daily after meals)'),
        durationDays: z.number().int().positive('Duration in days required'),
        instructions: z.string().optional(),
      })
    )
    .min(1, 'At least one medication is required'),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
