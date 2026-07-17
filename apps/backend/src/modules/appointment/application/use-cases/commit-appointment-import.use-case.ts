import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';

export interface CommitAppointmentImportInput {
  importId: string;
  /** Confirms the operator saw the preview's errors and wants to import only
   * the valid rows anyway. When false, any error row blocks commit entirely. */
  skipInvalidRows: boolean;
  idempotencyKey?: string;
  actor: AuthContext;
}

export interface CommitAppointmentImportOutput {
  importId: string;
  status: string;
}

/**
 * Validates the commit request against the cached preview snapshot and
 * enqueues `appointment.import.commit`. Does NOT re-resolve rows itself —
 * that only happens in the worker, which re-resolves fresh for a
 * retry-safe, always-current view (this use case's error gate is a fast
 * UX check against `previewJson`, not the source of truth for what the
 * worker will actually do).
 */
export class CommitAppointmentImportUseCase {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly jobQueue: IJobQueue,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService?: IIdempotencyService,
  ) {}

  async execute(input: CommitAppointmentImportInput): Promise<CommitAppointmentImportOutput> {
    const { importId, skipInvalidRows, actor, idempotencyKey } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'appointment.import',
      entityType: 'AppointmentImport',
    });

    if (idempotencyKey && this.idempotencyService) {
      const cached = await this.idempotencyService.get<CommitAppointmentImportOutput>(idempotencyKey, 'appointment.import.commit');
      if (cached) return cached;
    }

    // Only AM is cross-tenant here (matches GetImportStatusUseCase) — OP's
    // JWT tenantId is always null too, so this ends up cross-tenant for OP
    // as well without needing an explicit second branch.
    const tenantScope = actor.role === 'AM' ? null : actor.tenantId;
    const record = await this.importRepo.findById(importId, tenantScope);
    if (!record) {
      throw new NotFoundError('IMPORT_NOT_FOUND', `Appointment import ${importId} not found`);
    }

    if (record.status !== 'PREVIEW') {
      throw new ConflictError('IMPORT_NOT_IN_PREVIEW', `Import ${importId} is not awaiting commit (status: ${record.status})`);
    }

    if (!skipInvalidRows) {
      const preview = record.previewJson as { summary?: { withErrors?: number } } | null;
      const withErrors = preview?.summary?.withErrors ?? 0;
      if (withErrors > 0) {
        throw new ConflictError(
          'IMPORT_HAS_ERRORS',
          `${withErrors} row(s) have errors — set skipInvalidRows to import only the valid rows`,
        );
      }
    }

    // request_id is attached automatically by the job-queue infrastructure
    // from the ambient request context (see shared/infrastructure/queue.ts
    // `sendJob` — every job gets `_requestId` for free, no manual threading).
    // singletonKey (same pattern as the notification workers) closes the
    // window between this check and the idempotency record being persisted
    // below — pg-boss refuses a second active job with the same key, so two
    // concurrent commit calls for the same import can't both get enqueued.
    await this.jobQueue.enqueue('appointment.import.commit', {
      importId,
      actor,
    }, { singletonKey: importId });

    const result: CommitAppointmentImportOutput = { importId, status: 'PROCESSING' };

    if (idempotencyKey && this.idempotencyService) {
      await this.idempotencyService.set(idempotencyKey, 'appointment.import.commit', result, 24);
    }

    return result;
  }
}
