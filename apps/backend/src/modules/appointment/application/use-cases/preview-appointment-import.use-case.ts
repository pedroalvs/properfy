import type { AuthContext } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { AppointmentImportPreviewResponse } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ValidationError, ForbiddenError } from '../../../../shared/domain/errors';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';
import { AppointmentImportEntity } from '../../domain/appointment-import.entity';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AppointmentImportRowResolver } from '../services/appointment-import-row-resolver';
import { parseAppointmentImportFile } from '../../infrastructure/appointment-import-parser';
import {
  AppointmentBranchNotFoundError,
  AppointmentBranchInactiveError,
} from '../../domain/appointment.errors';

/** A synchronous preview does two unindexed-by-nothing lookups per row (both
 * batched, not per-row — see the resolver), but a runaway file is still a
 * bad HTTP experience. Cap and ask the operator to split it. */
const MAX_PREVIEW_ROWS = 2000;

export interface PreviewAppointmentImportInput {
  fileBuffer: Buffer;
  filename: string;
  branchId: string;
  actor: AuthContext;
}

export type PreviewAppointmentImportOutput = AppointmentImportPreviewResponse;

/**
 * Parses and resolves an appointment-import file synchronously, persisting an
 * `AppointmentImport` record in `PREVIEW` status so `commit` can re-resolve
 * the same stored file later. Read-only from the business-data point of view
 * — no appointment, property or contact is created here.
 */
export class PreviewAppointmentImportUseCase {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly branchRepo: IBranchRepository,
    private readonly resolver: AppointmentImportRowResolver,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: PreviewAppointmentImportInput): Promise<PreviewAppointmentImportOutput> {
    const { fileBuffer, filename, branchId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'appointment.import',
      entityType: 'AppointmentImport',
    });

    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      throw new ValidationError('File must be .xlsx or .csv');
    }

    // Resolve tenantId + validate branch — mirrors CreateAppointmentUseCase's
    // exact pattern: AM/OP are cross-tenant and infer tenant from the branch;
    // CL_ADMIN's branch must belong to their own JWT tenant.
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      const branch = await this.branchRepo.findById(branchId, '');
      if (!branch) throw new AppointmentBranchNotFoundError();
      if (!branch.isActive()) throw new AppointmentBranchInactiveError();
      tenantId = branch.tenantId;
    } else {
      // Fail closed rather than assert: a CL_ADMIN/CL_USER token without a
      // tenantId must never fall through to a cross-tenant branch lookup.
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      tenantId = actor.tenantId;
      const branch = await this.branchRepo.findById(branchId, tenantId);
      if (!branch) throw new AppointmentBranchNotFoundError();
      if (!branch.isActive()) throw new AppointmentBranchInactiveError();
    }

    const rawRows = await parseAppointmentImportFile(fileBuffer, ext);
    if (rawRows.length > MAX_PREVIEW_ROWS) {
      throw new ValidationError(
        `Import file has ${rawRows.length} rows; the maximum for preview is ${MAX_PREVIEW_ROWS}. Split it into smaller files.`,
      );
    }

    const id = crypto.randomUUID();
    const fileKey = `imports/appointments/${id}/${filename}`;
    const contentType = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    await this.storageService.upload(fileKey, fileBuffer, contentType);

    const tz = PLATFORM_TIMEZONE;
    const { rows, summary } = await this.resolver.resolve(rawRows, { tenantId, branchId, tz });

    const now = new Date();
    const entity = new AppointmentImportEntity({
      id,
      tenantId,
      branchId,
      status: 'PREVIEW',
      fileKey,
      originalFilename: filename,
      totalRows: rows.length,
      successCount: 0,
      errorCount: 0,
      errorsJson: null,
      previewJson: { summary, rows },
      resultsJson: null,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    await this.importRepo.save(entity);

    return { importId: id, branchId, tenantId, summary, rows };
  }
}
