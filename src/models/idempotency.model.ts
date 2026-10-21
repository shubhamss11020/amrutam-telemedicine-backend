export type IdempotencyStatus = 'IN_PROGRESS' | 'RESOLVED';

export interface IdempotencyModel {
  key: string;
  userId?: string;
  status: IdempotencyStatus;
  statusCode?: number;
  responseBody?: any;
  createdAt: Date;
  expiresAt: Date;
}
