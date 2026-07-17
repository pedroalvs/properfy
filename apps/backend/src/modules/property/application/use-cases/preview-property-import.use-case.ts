import type { AuthContext, PropertyImportPreviewResponse } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ValidationError, ForbiddenError } from '../../../../shared/domain/errors';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';
import { PropertyImportEntity } from '../../domain/property-import.entity';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import { TenantNotFoundError } from '../../../tenant/domain/tenant.errors';
import { TenantInactiveError } from '../../domain/property.errors';
import type { PropertyImportRowResolver } from '../services/property-import-row-resolver';
import { applyGeocodeVerification, computeImportSummary, type IImportGeocodeVerifier } from '../services/apply-geocode-verification';
import { parsePropertyImportFile } from '../../infrastructure/property-import-parser';

/** Same cap as the appointment-import preview — a synchronous preview must
 * stay a reasonable HTTP experience. */
const MAX_PREVIEW_ROWS = 2000;

interface ITenantLookup {
  findById(id: string): Promise<{ isActive(): boolean } | null>;
}

export interface PreviewPropertyImportInput {
  fileBuffer: Buffer;
  filename: string;
  /** Required for AM/OP (cross-tenant, no own scope); ignored for CL_ADMIN. */
  tenantId?: string;
  actor: AuthContext;
}

export type PreviewPropertyImportOutput = PropertyImportPreviewResponse;

/**
 * Parses and resolves a property-import file synchronously — including the
 * geocode verification of every unique NEW address — and persists a
 * `PropertyImport` record in `PREVIEW` status so `commit` can re-resolve the
 * same stored file later. Read-only from the business-data point of view:
 * no property is created here.
 */
export class PreviewPropertyImportUseCase {
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly tenantRepo: ITenantLookup,
    private readonly resolver: PropertyImportRowResolver,
    private readonly geocodeVerifier: IImportGeocodeVerifier,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: PreviewPropertyImportInput): Promise<PreviewPropertyImportOutput> {
    const { fileBuffer, filename, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'property.import',
      entityType: 'PropertyImport',
    });

    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      throw new ValidationError('File must be .xlsx or .csv');
    }

    // Tenant resolution mirrors CreatePropertyUseCase: AM/OP supply the
    // target tenantId explicitly; CL_ADMIN is scoped by their JWT.
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      if (!input.tenantId) {
        throw new ValidationError('tenantId is required');
      }
      tenantId = input.tenantId;
    } else {
      // Fail closed: a CL_ADMIN token without a tenantId must never fall
      // through to a cross-tenant import.
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      tenantId = actor.tenantId;
    }
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError();
    if (!tenant.isActive()) throw new TenantInactiveError();

    const rawRows = await parsePropertyImportFile(fileBuffer, ext);
    if (rawRows.length > MAX_PREVIEW_ROWS) {
      throw new ValidationError(
        `Import file has ${rawRows.length} rows; the maximum for preview is ${MAX_PREVIEW_ROWS}. Split it into smaller files.`,
      );
    }

    const id = crypto.randomUUID();
    const fileKey = `imports/properties/${id}/${filename}`;
    const contentType = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    await this.storageService.upload(fileKey, fileBuffer, contentType);

    const { rows } = await this.resolver.resolve(rawRows, { tenantId });
    // Geocode-verify unique new addresses AFTER resolution (the resolver
    // stays pure DB lookups, so the commit worker's re-resolve never
    // re-geocodes) and recompute the summary with the new warnings.
    await applyGeocodeVerification(rows, this.geocodeVerifier);
    const summary = computeImportSummary(rows);

    const now = new Date();
    const entity = new PropertyImportEntity({
      id,
      tenantId,
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

    return { importId: id, tenantId, summary, rows };
  }
}
