export interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface PrescriptionModel {
  id: string;
  consultationId: string;
  encryptedDiagnosis: string; // AES-256-GCM encrypted
  medications: MedicationItem[];
  digitalSignature: string; // HMAC-SHA256 signature
  issuedAt: Date;
}
