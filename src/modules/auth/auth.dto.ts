import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']).default('PATIENT'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().optional(),
  // Optional doctor profile fields if registering as DOCTOR
  specialization: z.string().optional(),
  experienceYears: z.number().int().nonnegative().optional(),
  consultationFee: z.number().nonnegative().optional(),
  bio: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const toggleMfaSchema = z.object({
  enable: z.boolean(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ToggleMfaInput = z.infer<typeof toggleMfaSchema>;
