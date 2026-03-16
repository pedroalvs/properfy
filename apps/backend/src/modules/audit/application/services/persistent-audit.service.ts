import type { AuditLogEntry } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IAuditLogRepository } from '../../domain/audit-log.repository';
import { AuditLogEntity } from '../../domain/audit-log.entity';

export class PersistentAuditService {
  constructor(
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly logger: Logger,
  ) {}

  log(entry: AuditLogEntry): void {
    // Log to structured logger (same as old AuditService)
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
      },
      `AUDIT: ${entry.action}`,
    );

    // Write to DB (fire-and-forget, don't block the caller)
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
    });

    this.auditLogRepo.save(entity).catch((err) => {
      this.logger.error({ err, action: entry.action }, 'Failed to persist audit log');
    });
  }
}
