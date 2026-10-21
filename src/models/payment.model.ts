export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface PaymentModel {
  id: string;
  consultationId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionRef: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}
