export interface AuditLogModel {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  createdAt: Date;
}
