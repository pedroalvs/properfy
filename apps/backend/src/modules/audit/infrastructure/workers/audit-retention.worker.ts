import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { getRetentionPeriod } from '../../domain/audit-retention';

const BATCH_SIZE = 1000;

export interface AuditRetentionResult {
  deletedCount: number;
  preservedCount: number;
}

export class AuditRetentionWorker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async execute(now: Date = new Date()): Promise<AuditRetentionResult> {
    let totalDeleted = 0;
    let totalPreserved = 0;

    // Fetch distinct actions to process each category independently
    const distinctActions: { action: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT DISTINCT action FROM "audit_logs"`,
    );

    for (const { action } of distinctActions) {
      const retentionMs = getRetentionPeriod(action);
      const cutoffDate = new Date(now.getTime() - retentionMs);

      // Count candidates (entries older than cutoff for this action)
      const candidates: { count: number }[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "audit_logs"
         WHERE action = $1 AND created_at < $2`,
        action,
        cutoffDate,
      );
      const candidateCount = candidates[0]?.count ?? 0;

      if (candidateCount === 0) {
        continue;
      }

      // Find IDs of entries protected by the cross-check rule:
      // appointment.statusTransition entries where after_json->'status' = 'DONE'
      // AND the related appointment has done_checked_at IS NULL
      let protectedIds: string[] = [];
      if (action === 'appointment.statusTransition') {
        const protectedRows: { id: string }[] = await this.prisma.$queryRawUnsafe(
          `SELECT al.id FROM "audit_logs" al
           INNER JOIN "appointments" a ON a.id = al.entity_id
           WHERE al.action = $1
             AND al.created_at < $2
             AND al.after_json->>'status' = 'DONE'
             AND a.done_checked_at IS NULL`,
          action,
          cutoffDate,
        );
        protectedIds = protectedRows.map((r) => r.id);
        totalPreserved += protectedIds.length;
      }

      // Delete in batches, excluding protected IDs
      let deletedForAction = 0;
      let hasMore = true;

      while (hasMore) {
        let deletedBatch: number;

        if (protectedIds.length > 0) {
          const result: { count: number }[] = await this.prisma.$queryRawUnsafe(
            `WITH to_delete AS (
               SELECT id FROM "audit_logs"
               WHERE action = $1
                 AND created_at < $2
                 AND id != ALL($3::uuid[])
               LIMIT $4
             )
             DELETE FROM "audit_logs"
             WHERE id IN (SELECT id FROM to_delete)
             RETURNING 1`,
            action,
            cutoffDate,
            protectedIds,
            BATCH_SIZE,
          );
          deletedBatch = result.length;
        } else {
          const result: { count: number }[] = await this.prisma.$queryRawUnsafe(
            `WITH to_delete AS (
               SELECT id FROM "audit_logs"
               WHERE action = $1
                 AND created_at < $2
               LIMIT $3
             )
             DELETE FROM "audit_logs"
             WHERE id IN (SELECT id FROM to_delete)
             RETURNING 1`,
            action,
            cutoffDate,
            BATCH_SIZE,
          );
          deletedBatch = result.length;
        }

        deletedForAction += deletedBatch;
        hasMore = deletedBatch === BATCH_SIZE;
      }

      if (deletedForAction > 0) {
        this.logger.info(
          { action, deletedCount: deletedForAction, cutoffDate: cutoffDate.toISOString() },
          `Audit retention: deleted ${deletedForAction} entries for action ${action}`,
        );
      }

      totalDeleted += deletedForAction;
    }

    this.logger.info(
      { deletedCount: totalDeleted, preservedCount: totalPreserved },
      'Audit retention sweep completed',
    );

    return { deletedCount: totalDeleted, preservedCount: totalPreserved };
  }
}
