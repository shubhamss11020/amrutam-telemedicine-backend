import { z } from 'zod';

export const processPaymentSchema = z.object({
  consultationId: z.string().uuid('Valid consultationId UUID required'),
  paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET']).default('UPI'),
  simulateFailure: z.boolean().optional().default(false), // For testing saga compensation rollback
});

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
