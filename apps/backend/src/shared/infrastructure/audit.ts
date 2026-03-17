export interface AuditLogEntry {
  action: string;
  actorType: 'USER' | 'SYSTEM' | 'ANONYMOUS';
  actorId?: string;
  entityType: string;
  entityId?: string;
  tenantId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  log(entry: AuditLogEntry): void;
}
