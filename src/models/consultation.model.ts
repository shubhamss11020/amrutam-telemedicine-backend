export type ConsultationStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ConsultationModel {
  id: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  status: ConsultationStatus;
  encryptedSymptoms?: string; // AES-256-GCM encrypted Protected Health Info
  doctorNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}
