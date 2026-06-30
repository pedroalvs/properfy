import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { PersistentAuditService } from '../../application/services/persistent-audit.service';
import type { IAuditLogRepository } from '../../domain/audit-log.repository';
import type { IAuditRetentionCategoryRepository } from '../../domain/audit-retention-category.repository';
import type { IAuditLegalHoldRepository } from '../../domain/audit-legal-hold.repository';
import type { IAuditPreservationRuleRepository } from '../../domain/audit-preservation-rule.repository';
import type { AuditLegalHoldEntity } from '../../domain/audit-legal-hold.entity';
import type { AuditRetentionCategory } from '@properfy/shared';
import { getCategoryForAction } from '../../domain/audit-retention';

export interface AuditRetentionResult {
  movedCount: number;
  preservedCount: number;
  preservedByRule: {
    crossCheck: number;
    legalHold: number;
  };
  hardDeletedCount: number;
  skippedInProgressCount: number;
  erroredCount: number;
  rentalTenantPortalMovedCount: number;
}

/**
 * Feature 020: reshaped audit retention worker.
 *
 * Critical reshape versus the pre-020 implementation:
 *   1. **Hot → cold move** replaces the hard delete. Eligible rows move from
 *      `audit_logs` to `audit_logs_archive` in a single DB transaction
 *      (INSERT ... SELECT + DELETE inside `moveToCold`).
 *   2. **Preservation rule evaluation** in a strict order:
 *      (a) inline cross-check rule (FR-008, non-disableable — the double-enforced
 *          006 safety net: appointment.statusTransition entries with
 *          after_json.status = 'DONE' AND a.done_checked_at IS NULL),
 *      (b) DB-backed legal holds.
 *      (FR-009 active-dispute rule was removed in Sprint 1 W-5 — see
 *      `specs/020-audit-retention-pii-redaction/spec.md` Delivery Outcome.)
 *   3. **`redaction_status = IN_PROGRESS` skip** — concurrency guard for the
 *      erasure workflow.
 *   4. **Configurable batch size** via `AUDIT_RETENTION_BATCH_SIZE` (FR-003).
 *   5. **Self-audit** — emits a single `audit.retention_run_completed` entry
 *      per run with the full summary (FR-028).
 *   6. **Hard-delete sweep** as a separate final phase, off by default per
 *      category (FR-005 + FR-034).
 *   7. **Second pass** against `rental_tenant_portal_activities` (FR-031).
 */
export class AuditRetentionWorker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly retentionCategoryRepo: IAuditRetentionCategoryRepository,
    private readonly legalHoldRepo: IAuditLegalHoldRepository,
    private readonly preservationRuleRepo: IAuditPreservationRuleRepository,
    private readonly auditService: PersistentAuditService,
    private readonly logger: Logger,
    private readonly batchSize: number = 1000,
  ) {}

  async execute(now: Date = new Date()): Promise<AuditRetentionResult> {
    const startedAt = now;
    const result: AuditRetentionResult = {
      movedCount: 0,
      preservedCount: 0,
      preservedByRule: { crossCheck: 0, legalHold: 0 },
      hardDeletedCount: 0,
      skippedInProgressCount: 0,
      erroredCount: 0,
      rentalTenantPortalMovedCount: 0,
    };

    try {
      const categories = await this.retentionCategoryRepo.findAll();
      if (categories.length === 0) {
        this.logger.warn(
          {},
          'audit retention: no category config found — run seed migration first',
        );
        return result;
      }

      const legalHolds = await this.legalHoldRepo.findAllActive();

      // Phase 1: hot → cold move per category
      for (const category of categories) {
        const cutoffDate = new Date(now.getTime() - category.retentionMs());
        try {
          await this.processCategoryMove(category.name, cutoffDate, legalHolds, result);
        } catch (err) {
          this.logger.error(
            { err, category: category.name },
            'audit retention: processCategoryMove failed, continuing to next category',
          );
          result.erroredCount++;
        }
      }

      // Phase 2: hard-delete sweep (off by default per FR-034)
      for (const category of categories) {
        if (!category.hardDeleteEnabled) continue;
        const hardDeleteCutoff = new Date(
          now.getTime() - category.retentionMs() - 365.25 * 24 * 60 * 60 * 1000,
        );
        try {
          const count = await this.hardDeleteSweep(category.name, hardDeleteCutoff);
          result.hardDeletedCount += count;
        } catch (err) {
          this.logger.error(
            { err, category: category.name },
            'audit retention: hardDeleteSweep failed',
          );
          result.erroredCount++;
        }
      }

      // Phase 3: rental_tenant_portal_activities parallel pass
      for (const category of categories) {
        const cutoffDate = new Date(now.getTime() - category.retentionMs());
        try {
          const moved = await this.processRentalTenantPortalMove(category.name, cutoffDate);
          result.rentalTenantPortalMovedCount += moved;
        } catch (err) {
          this.logger.error(
            { err, category: category.name },
            'audit retention: tenant portal move failed',
          );
          result.erroredCount++;
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'audit retention worker fatal error');
      result.erroredCount++;
    }

    // Emit the self-audit entry summarizing the run (FR-028).
    this.auditService.log({
      actorType: 'SYSTEM',
      entityType: 'AuditRetention',
      action: 'audit.retention_run_completed',
      metadata: {
        movedCount: result.movedCount,
        preservedCount: result.preservedCount,
        preservedByRule: result.preservedByRule,
        hardDeletedCount: result.hardDeletedCount,
        skippedInProgressCount: result.skippedInProgressCount,
        erroredCount: result.erroredCount,
        rentalTenantPortalMovedCount: result.rentalTenantPortalMovedCount,
        startedAtIso: startedAt.toISOString(),
        finishedAtIso: new Date().toISOString(),
      },
    });

    this.logger.info(result, 'audit retention sweep completed');

    return result;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async processCategoryMove(
    category: AuditRetentionCategory,
    cutoffDate: Date,
    legalHolds: AuditLegalHoldEntity[],
    result: AuditRetentionResult,
  ): Promise<void> {
    let hasMore = true;

    while (hasMore) {
      const batch = await this.auditLogRepo.findEligibleForRetention(
        category,
        cutoffDate,
        this.batchSize,
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const moveCandidates: string[] = [];

      for (const entry of batch) {
        // Lazy backfill: if retention_category is NULL (row written pre-020),
        // compute it on the fly via the synchronous classifier.
        const effectiveCategory = entry.retentionCategory ?? getCategoryForAction(entry.action);
        if (effectiveCategory !== category) continue;

        // Concurrency guard: skip rows flagged mid-erasure.
        if (entry.redactionStatus === 'IN_PROGRESS') {
          result.skippedInProgressCount++;
          continue;
        }

        // Preservation rule 1 — inline cross-check guard (FR-008, non-disableable).
        if (
          entry.action === 'appointment.statusTransition' ||
          entry.action === 'appointment.status_transition'
        ) {
          const preserved = await this.isCrossCheckPreserved(entry.entityId);
          if (preserved) {
            result.preservedCount++;
            result.preservedByRule.crossCheck++;
            continue;
          }
        }

        // Preservation rule 2 — legal holds.
        const heldBy = legalHolds.find((h) =>
          h.matches(entry.entityType, entry.entityId, entry.tenantId),
        );
        if (heldBy) {
          result.preservedCount++;
          result.preservedByRule.legalHold++;
          continue;
        }

        // Feature 020 FR-009 (active-dispute preservation rule) was removed
        // in Sprint 1 W-5 (2026-04-13). The rule was a non-functional stub —
        // it never preserved anything — and advertising a control that does
        // not exist is a worse posture than not having the control at all.
        // When a dispute entity is added in a future feature, this is the
        // place to re-introduce the rule as a real evaluation (not a stub).

        moveCandidates.push(entry.id);
      }

      if (moveCandidates.length > 0) {
        const moved = await this.auditLogRepo.moveToCold(moveCandidates);
        result.movedCount += moved;
      }

      // Stop iterating when the eligible batch was smaller than the page size
      // to avoid an infinite loop when every row in the page is preserved.
      if (batch.length < this.batchSize) {
        hasMore = false;
      }
    }
  }

  /**
   * FR-008 cross-check preservation: reads `appointments.done_checked_at`
   * directly via Prisma (read-only, no repository dependency to keep the
   * worker self-contained). Returns true when the appointment is still in
   * an active cross-check window (done_checked_at IS NULL).
   */
  private async isCrossCheckPreserved(entityId: string | null): Promise<boolean> {
    if (!entityId) return false;
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: entityId },
      select: { done_checked_at: true },
    });
    if (!appointment) return false;
    return appointment.done_checked_at === null;
  }

  private async hardDeleteSweep(
    category: AuditRetentionCategory,
    cutoffDate: Date,
  ): Promise<number> {
    // Hard delete from the archive table only. Skips any row that still
    // carries a preservation_rule_id (defense-in-depth: archive rows should
    // have their preservation marker cleared before hard-delete is allowed).
    const eligibleIds: Array<{ id: string }> = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM "audit_logs_archive"
       WHERE retention_category = $1::"AuditRetentionCategory"
         AND created_at < $2
         AND preservation_rule_id IS NULL
       LIMIT $3`,
      category,
      cutoffDate,
      this.batchSize,
    );

    if (eligibleIds.length === 0) return 0;

    const ids = eligibleIds.map((r) => r.id);
    return this.auditLogRepo.hardDeleteFromArchive(ids);
  }

  /**
   * Feature 020 FR-031: same hot → cold move against the parallel
   * `rental_tenant_portal_activities` surface. Uses raw SQL because the table has a
   * different shape and a light-touch repository is not warranted yet.
   */
  private async processRentalTenantPortalMove(
    category: AuditRetentionCategory,
    cutoffDate: Date,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows: Array<{ id: string }> = await tx.$queryRawUnsafe(
        `SELECT id FROM "rental_tenant_portal_activities"
         WHERE retention_category = $1::"AuditRetentionCategory"
           AND created_at < $2
           AND redaction_status != 'IN_PROGRESS'
         LIMIT $3`,
        category,
        cutoffDate,
        this.batchSize,
      );
      if (rows.length === 0) return 0;
      const ids = rows.map((r) => r.id);

      await tx.$executeRawUnsafe(
        `INSERT INTO "rental_tenant_portal_activities_archive"
           (id, appointment_id, tenant_portal_token_id, action, previous_values_json,
            new_values_json, ip_address, user_agent, created_at,
            retention_category, redaction_status, cold_storage)
         SELECT id, appointment_id, tenant_portal_token_id, action, previous_values_json,
                new_values_json, ip_address, user_agent, created_at,
                retention_category, redaction_status, true
         FROM "rental_tenant_portal_activities"
         WHERE id = ANY($1)
         ON CONFLICT (id) DO NOTHING`,
        ids,
      );

      const deleted: number = await tx.$executeRawUnsafe(
        `DELETE FROM "rental_tenant_portal_activities" WHERE id = ANY($1)`,
        ids,
      );

      return typeof deleted === 'number' ? deleted : ids.length;
    });
  }
}
