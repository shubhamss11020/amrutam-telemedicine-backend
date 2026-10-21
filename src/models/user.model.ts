export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface UserModel {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isMfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileModel {
  id: string;
  userId: string;
  fullName: string;
  phone?: string;
  emergencyContact?: string;
  encryptedMedicalHistory?: string;
  createdAt: Date;
  updatedAt: Date;
}
