export interface DoctorModel {
  id: string;
  userId: string;
  fullName: string;
  specialization: string;
  experienceYears: number;
  consultationFee: number;
  rating: number;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}
