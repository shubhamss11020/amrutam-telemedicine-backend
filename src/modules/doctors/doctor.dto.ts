import { z } from 'zod';

export const doctorSearchSchema = z.object({
  specialization: z.string().optional(),
  minRating: z.string().optional().transform((v) => (v ? parseFloat(v) : undefined)),
  maxFee: z.string().optional().transform((v) => (v ? parseFloat(v) : undefined)),
  search: z.string().optional(),
});

export type DoctorSearchParams = z.infer<typeof doctorSearchSchema>;
