import type { AuthContext } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import type { IDataSubjectErasureRequestRepository } from '../../domain/data-subject-erasure-request.repository';
import type { IAuditLogRepository } from '../../domain/audit-log.repository';
import type { IPiiFieldMappingRepository } from '../../domain/pii-field-mapping.repository';
import type { IErasurePiiResolver } from '../../domain/erasure-pii-resolver';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { redactByFieldPath, type PiiFieldPathSpec } from '../helpers/pii-redaction';
import {
  ErasureForbiddenError,
  ErasureRequestNotFoundError,
  ErasureRequestInvalidStateError,
} from '../../domain/audit.errors';

export interface ExecuteDataSubjectErasureInput {
  requestId: string;
  actor: AuthContext;
}

export interface ExecuteDataSubjectErasureOutput {
  requestId: string;
  status: string;
  entriesFound: number;
  entriesRedacted: number;
  entriesFlaggedForReview: number;
  entriesSkipped: number;
}

/**
 * Feature 020 FR-014 / FR-015: AM-only execution phase of the data subject
 * erasure workflow. Redacts matched audit entries in place while preserving
 * structural integrity (action / entity id / actor id / created_at remain
 * untouched). Irreversible.
 *
 * Concurrency guard: marks all target rows `redaction_status = IN_PROGRESS`
 * atomically BEFORE iterating. The retention worker skips any row in that
 * state (see `audit-retention.worker.ts::processCategoryMove`).
 *
 * Meta-audit: emits exactly one `audit.data_subject_erasure_executed` entry
 * with counts only (no subject PII).
 */
export class ExecuteDataSubjectErasureUseCase {
  constructor(
    private readonly erasureRequestRepo: IDataSubjectErasureRequestRepository,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly piiFieldMappingRepo: IPiiFieldMappingRepository,
    private readonly erasurePiiResolver: IErasurePiiResolver,
    private readonly auditService: PersistentAuditService,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async execute(input: ExecuteDataSubjectErasureInput): Promise<ExecuteDataSubjectErasureOutput> {
    if (input.actor.role !== 'AM') {
      throw new ErasureForbiddenError();
    }

    const request = await this.erasureRequestRepo.findById(input.requestId);
    if (!request) throw new ErasureRequestNotFoundError();

    if (request.status !== 'PREVIEW' && request.status !== 'CONFIRMED') {
      throw new ErasureRequestInvalidStateError(request.status, 'execute');
    }

    // #435: atomic PREVIEW/CONFIRMED → EXECUTING compare-and-set. Only the
    // caller that flips the row proceeds; a concurrent caller receives `false`
    // and must not re-run the redaction or emit a second meta-audit entry.
    const won = await this.erasureRequestRepo.transitionStatus(
      request.id,
      ['PREVIEW', 'CONFIRMED'],
      'EXECUTING',
    );
    if (!won) {
      // A concurrent caller already advanced this request past PREVIEW/CONFIRMED.
      // Bail out before any redaction or meta-audit so the work runs exactly once.
      throw new ErasureRequestInvalidStateError(request.status, 'execute (already in progress)');
    }
    // Sync the in-memory entity with the persisted EXECUTING status.
    request.markExecuting();

    // Re-resolve PII values from the persisted snapshot to avoid a race where
    // the subject's user record changed between preview and confirm.
    const piiValues = request.resolvedPiiValuesJson ?? [];

    if (piiValues.length === 0) {
      request.markCompleted(0, { reason: 'no_pii_values_resolved' });
      await this.erasureRequestRepo.update(request);
      this.emitMetaAudit(input.actor, request.id, 0, 0, 0);
      return {
        requestId: request.id,
        status: request.status,
        entriesFound: 0,
        entriesRedacted: 0,
        entriesFlaggedForReview: 0,
        entriesSkipped: 0,
      };
    }

    const mappings = await this.piiFieldMappingRepo.findAll();
    const allFieldPaths = mappings.map((m) => m.jsonFieldPath);

    // Scan hot + cold by the resolved values
    const matches = await this.auditLogRepo.searchPiiByValues(piiValues, allFieldPaths, {
      includeArchived: true,
    });

    if (matches.length === 0) {
      request.markCompleted(0, { reason: 'no_matches' });
      await this.erasureRequestRepo.update(request);
      this.emitMetaAudit(input.actor, request.id, 0, 0, 0);
      return {
        requestId: request.id,
        status: request.status,
        entriesFound: 0,
        entriesRedacted: 0,
        entriesFlaggedForReview: 0,
        entriesSkipped: 0,
      };
    }

    // Concurrency guard: flag all targets IN_PROGRESS atomically
    const ids = matches.map((m) => m.id);
    await this.auditLogRepo.updateRedactionStatus(ids, 'IN_PROGRESS');

    // Iterate and redact
    let redactedCount = 0;
    let flaggedCount = 0;
    let skippedCount = 0;
    const failedIds: string[] = [];

    const entries = await this.auditLogRepo.findByIds(ids, { includeArchived: true });
    for (const entry of entries) {
      // Skip entries already fully redacted — idempotent re-runs
      if (entry.redactionStatus === 'FULL') {
        skippedCount++;
        continue;
      }

      // Resolve field paths for this entry's action
      const actionMappings = mappings.filter((m) => m.appliesTo(entry.action));
      if (actionMappings.length === 0) {
        flaggedCount++;
        continue;
      }

      const specs: PiiFieldPathSpec[] = actionMappings.map((m) => ({
        path: m.jsonFieldPath,
        classification: m.classification as 'direct' | 'sensitive_financial' | 'unstructured',
      }));

      const beforeResult = redactByFieldPath(entry.beforeJson, specs);
      const afterResult = redactByFieldPath(entry.afterJson, specs);
      const metadataResult = redactByFieldPath(entry.metadataJson, specs);

      const hasUnstructured =
        beforeResult.flaggedForReview.length > 0 ||
        afterResult.flaggedForReview.length > 0 ||
        metadataResult.flaggedForReview.length > 0;

      const finalStatus = hasUnstructured ? 'PARTIAL' : 'FULL';

      // #444: a PARTIAL entry still carries unstructured PII a human must
      // review, so count it as flagged in addition to (not instead of) the
      // no-mapping branch above.
      if (hasUnstructured) flaggedCount++;

      try {
        await this.auditLogRepo.updateRedactedSnapshots(
          entry.id,
          beforeResult.redacted,
          afterResult.redacted,
          metadataResult.redacted as Record<string, unknown> | null,
          finalStatus,
        );
        redactedCount++;
      } catch (err) {
        this.logger.error(
          { err, entryId: entry.id, requestId: request.id },
          'erasure: failed to update snapshot — leaving IN_PROGRESS for retry',
        );
        failedIds.push(entry.id);
      }
    }

    const completionReport: Record<string, unknown> = {
      entriesFound: matches.length,
      entriesRedacted: redactedCount,
      entriesFlaggedForReview: flaggedCount,
      entriesSkipped: skippedCount + failedIds.length,
      failedEntryIds: failedIds,
    };

    // #412: never persist COMPLETED while rows remain IN_PROGRESS. If any
    // snapshot update failed, mark the request FAILED and record the skipped
    // ids in the completion report. NOTE: FAILED is terminal and those rows
    // stay IN_PROGRESS — the retention worker excludes IN_PROGRESS rows, so
    // recovery is a NEW erasure request for the same subject (searchPiiByValues
    // re-matches them; it has no status filter), not an automatic retry.
    if (failedIds.length > 0) {
      const errorMessage = `erasure incomplete: ${failedIds.length} entr${
        failedIds.length === 1 ? 'y' : 'ies'
      } left IN_PROGRESS`;
      request.markFailed(errorMessage);
      request.completionReportJson = { error: errorMessage, ...completionReport };
    } else {
      request.markCompleted(redactedCount, completionReport);
    }
    await this.erasureRequestRepo.update(request);

    this.emitMetaAudit(input.actor, request.id, matches.length, redactedCount, flaggedCount);

    return {
      requestId: request.id,
      status: request.status,
      entriesFound: matches.length,
      entriesRedacted: redactedCount,
      entriesFlaggedForReview: flaggedCount,
      entriesSkipped: skippedCount + failedIds.length,
    };
  }

  /**
   * FR-030: meta-audit entry must NOT contain any subject PII. Only counts
   * and structural identifiers are recorded.
   */
  private emitMetaAudit(
    actor: AuthContext,
    requestId: string,
    entriesFound: number,
    entriesRedacted: number,
    entriesFlaggedForReview: number,
  ): void {
    this.auditService.log({
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'DataSubjectErasureRequest',
      entityId: requestId,
      action: 'audit.data_subject_erasure_executed',
      tenantId: actor.tenantId ?? undefined,
      metadata: {
        requestId,
        entriesFound,
        entriesRedacted,
        entriesFlaggedForReview,
      },
    });
  }
}
