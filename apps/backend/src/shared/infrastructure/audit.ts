export interface AuditLogEntry {
  action: string;
  actorType: 'USER' | 'SYSTEM' | 'ANONYMOUS';
  actorId?: string;
  entityType: string;
  entityId?: string;
  /**
   * 024 §Audit — explicit `null` is allowed for entity-scoped audits where
   * the entity itself has no tenant (e.g. a standalone Contact created by
   * AM/OP before any appointment links it). `undefined` means "not
   * recorded for this action". Use `metadata.actor_tenant_id` to preserve
   * the operator's home tenant for cross-tenant actions.
   */
  tenantId?: string | null;
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
