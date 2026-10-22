/**
 * Audit port (domain).
 *
 * The `AuditService` interface and its `AuditLogEntry` payload are ports the
 * domain and application layers depend on. They live here — not in
 * `infrastructure/` — so that domain services (e.g. `AuthorizationService`)
 * respect the dependency rule (`infrastructure → domain`, never the reverse).
 * The concrete implementation (`PersistentAuditService`) lives in the audit
 * module's application/infrastructure layers and implements this interface.
 *
 * `shared/infrastructure/audit.ts` re-exports these types for the call sites
 * that still import from the old path.
 */
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
