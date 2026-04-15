import type { AuditLogEntry } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IAuditLogRepository } from '../../domain/audit-log.repository';
import { AuditLogEntity } from '../../domain/audit-log.entity';
import { getCategoryForAction } from '../../domain/audit-retention';

/**
 * Feature 020 (2026-04-13) — write-time PII destruction is **reversed**.
 *
 * Before 020: `log()` called `redactPii()` on `before` / `after` before
 * persistence, destroying PII irreversibly at write time.
 *
 * After 020: entries are written with PII **intact** so AM can investigate
 * history and the on-demand erasure workflow (FR-014) can redact per-subject.
 * Role-based read-time masking (FR-025) is applied by `ListAuditLogsUseCase`.
 *
 * Entries written before 020 shipped remain permanently `[REDACTED]` — the
 * reversal is asymmetric and documented as a residual in `plan.md`.
 *
 * This service also stamps `retention_category` at write time (FR-001) using
 * the synchronous classifier helper.
 */
export class PersistentAuditService {
  constructor(
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly logger: Logger,
  ) {}

  log(entry: AuditLogEntry): void {
    // Feature 020: classify the action synchronously so the retention category
    // is stamped on the row at persist time. Lazy backfill on older rows is
    // handled by the retention worker when `retention_category IS NULL`.
    const retentionCategory = getCategoryForAction(entry.action);

    // Log to structured logger (same fields as before — no redaction).
    this.logger.info(
      {
        audit: true,
        action: entry.action,
        actorType: entry.actorType,
        actorId: entry.actorId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        tenantId: entry.tenantId,
        requestId: entry.requestId,
        ipAddress: entry.ipAddress,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        metadata: entry.metadata,
        retentionCategory,
      },
      `AUDIT: ${entry.action}`,
    );

    // Write to DB (fire-and-forget — errors don't propagate to the caller).
    const entity = new AuditLogEntity({
      id: crypto.randomUUID(),
      tenantId: entry.tenantId ?? null,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      reason: entry.reason ?? null,
      beforeJson: entry.before ?? null,
      afterJson: entry.after ?? null,
      requestId: entry.requestId ?? null,
      ipAddress: entry.ipAddress ?? null,
      metadataJson: entry.metadata ?? null,
      createdAt: new Date(),
      retentionCategory,
      redactionStatus: 'NONE',
      coldStorage: false,
      preservationRuleId: null,
    });

    this.auditLogRepo.save(entity).catch((err) => {
      this.logger.error({ err, action: entry.action }, 'Failed to persist audit log');
    });
  }
}
