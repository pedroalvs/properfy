import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';

export interface CommitPropertyImportInput {
  importId: string;
  /** Confirms the operator saw the preview's errors and wants to import only
   * the valid rows anyway. When false, any error row blocks commit entirely. */
  skipInvalidRows: boolean;
  idempotencyKey?: string;
  actor: AuthContext;
}

export interface CommitPropertyImportOutput {
  importId: string;
  status: string;
}

/**
 * Validates the commit request against the cached preview snapshot and
 * enqueues `property.import.commit`. Does NOT re-resolve rows itself — that
 * only happens in the worker, which re-resolves fresh for a retry-safe,
 * always-current view (this use case's error gate is a fast UX check against
 * `previewJson`, not the source of truth for what the worker will do).
 * Mirrors `CommitAppointmentImportUseCase`.
 */
export class CommitPropertyImportUseCase {
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly jobQueue: IJobQueue,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService?: IIdempotencyService,
  ) {}

  async execute(input: CommitPropertyImportInput): Promise<CommitPropertyImportOutput> {
    const { importId, skipInvalidRows, actor, idempotencyKey } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'property.import',
      entityType: 'PropertyImport',
    });

    if (idempotencyKey && this.idempotencyService) {
      const cached = await this.idempotencyService.get<CommitPropertyImportOutput>(idempotencyKey, 'property.import.commit');
      if (cached) return cached;
    }

    // Only AM is cross-tenant here (matches GetPropertyImportStatusUseCase).
    const tenantScope = actor.role === 'AM' ? null : actor.tenantId;
    const record = await this.importRepo.findById(importId, tenantScope);
    if (!record) {
      throw new NotFoundError('IMPORT_NOT_FOUND', `Property import ${importId} not found`);
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

    // singletonKey closes the window between this check and the idempotency
    // record being persisted below — pg-boss refuses a second active job with
    // the same key, so two concurrent commits can't both get enqueued.
    await this.jobQueue.enqueue('property.import.commit', {
      importId,
      actor,
    }, { singletonKey: importId });

    const result: CommitPropertyImportOutput = { importId, status: 'PROCESSING' };

    if (idempotencyKey && this.idempotencyService) {
      await this.idempotencyService.set(idempotencyKey, 'property.import.commit', result, 24);
    }

    return result;
  }
}
