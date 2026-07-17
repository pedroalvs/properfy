import { Prisma } from '@prisma/client';
import type { AuthContext, GeocodeVerification, PropertyType, ResolvedPropertyImportRow } from '@properfy/shared';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IPropertyRepository } from '../../domain/property.repository';
import { PropertyEntity } from '../../domain/property.entity';
import type { PropertyImportRowResolver } from '../../application/services/property-import-row-resolver';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { parsePropertyImportFile } from '../property-import-parser';
import { buildNormalizedAddressKey } from '../../../../shared/domain/normalize-address';

interface ImportRowResult {
  rowNumber: number;
  status: 'created' | 'reused' | 'error';
  propertyId?: string;
  message?: string;
}

export interface PropertyImportCommitJobData {
  importId: string;
  actor: AuthContext;
}

type PreviewSnapshot = { rows?: Array<{ property?: ResolvedPropertyImportRow['property'] }> };

/**
 * Commits a previewed property import: re-resolves the stored file fresh (a
 * property created since preview, a code claimed, a soft-delete — all
 * reflect current state; TOCTOU rows are reported, not silently imported),
 * then creates one property per importable NEW first-occurrence row.
 *
 * Geocode reuse — the whole point of the preview's synchronous verification:
 * a `found` address is persisted with its coordinates (SUCCESS, no
 * `property.geocode` job); `not_found` is persisted FAILED (no job — the
 * geocode-retry sweep remains the safety net); only `unverified`/missing
 * falls back to the legacy PENDING + async-job path. The cache lives in
 * `previewJson` keyed by normalized address — a fact about the address
 * string, safe to carry across the preview/commit gap.
 */
export class PropertyImportCommitWorker {
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly propertyRepo: IPropertyRepository,
    private readonly resolver: PropertyImportRowResolver,
    private readonly jobQueue: IJobQueue,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(data: PropertyImportCommitJobData): Promise<void> {
    const { importId, actor } = data;

    const importRecord = await this.importRepo.findById(importId, null);
    if (!importRecord) {
      this.logger.warn({ importId }, 'Property import record not found (swept?)');
      return;
    }

    await this.importRepo.update(importId, { status: 'PROCESSING' });
    this.logger.info({ importId }, 'Committing property import');

    // Resume support: a prior partial attempt may have recorded outcomes for
    // some rows already — carry those forward instead of re-committing them.
    const priorResults = Array.isArray(importRecord.resultsJson)
      ? (importRecord.resultsJson as ImportRowResult[])
      : [];
    const priorByRow = new Map(priorResults.map((r) => [r.rowNumber, r]));

    const geocodeCache = this.buildGeocodeCache(importRecord.previewJson as PreviewSnapshot | null);

    try {
      const fileBuffer = await this.storageService.download(importRecord.fileKey);
      const ext = importRecord.originalFilename.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
      const rawRows = await parsePropertyImportFile(fileBuffer, ext);

      const { rows } = await this.resolver.resolve(rawRows, { tenantId: importRecord.tenantId });

      const createdPropertyIds = new Map<string, string>();
      const results: ImportRowResult[] = [];

      for (const row of rows) {
        const prior = priorByRow.get(row.rowNumber);
        const result = prior ?? await this.processRow(row, importRecord.tenantId, geocodeCache, createdPropertyIds);
        // A resumed 'created'/'reused' row must still seed the intra-batch
        // map, or a later duplicate row would create a second property.
        if (prior?.propertyId && row.property) {
          createdPropertyIds.set(this.planKey(row.property), prior.propertyId);
        }
        results.push(result);
        // Progress fields update on every row — the frontend derives
        // percent-complete from these while the batch is running.
        await this.importRepo.update(importId, {
          resultsJson: [...results],
          totalRows: rows.length,
          successCount: results.filter((r) => r.status !== 'error').length,
          errorCount: results.filter((r) => r.status === 'error').length,
        });
      }

      const errorResults = results.filter((r) => r.status === 'error');
      const successCount = results.length - errorResults.length;
      const finalStatus = errorResults.length > 0 && successCount === 0 ? 'FAILED' : 'COMPLETED';

      await this.importRepo.update(importId, {
        status: finalStatus,
        totalRows: rows.length,
        successCount,
        errorCount: errorResults.length,
        resultsJson: [...results],
        // Legacy error shape keeps GET status consumers and errors.csv working.
        errorsJson: errorResults.map((r) => ({ row: r.rowNumber, field: 'general', message: r.message ?? 'Row failed' })),
      });

      this.auditService.log({
        action: 'property.imported.batch',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'PropertyImport',
        entityId: importId,
        tenantId: importRecord.tenantId,
        after: {
          importId,
          totalRows: rows.length,
          successCount,
          errorCount: errorResults.length,
          propertyIds: [...new Set(results.filter((r) => r.status === 'created').map((r) => r.propertyId!))],
        },
      });

      this.logger.info({ importId, totalRows: rows.length, successCount, errorCount: errorResults.length }, 'Property import commit completed');
    } catch (err) {
      await this.importRepo.update(importId, { status: 'FAILED' });
      this.logger.error({ importId, error: err }, 'Property import commit failed');
      throw err;
    }
  }

  private planKey(plan: NonNullable<ResolvedPropertyImportRow['property']>): string {
    return buildNormalizedAddressKey({
      street: plan.street,
      addressLine2: plan.addressLine2,
      suburb: plan.suburb,
      state: plan.state,
      postcode: plan.postcode,
    });
  }

  /** Geocode verifications from the preview, keyed by normalized address. */
  private buildGeocodeCache(preview: PreviewSnapshot | null): Map<string, GeocodeVerification> {
    const cache = new Map<string, GeocodeVerification>();
    for (const row of preview?.rows ?? []) {
      const plan = row.property;
      if (!plan || plan.resolution !== 'new' || !plan.geocode) continue;
      cache.set(this.planKey(plan), plan.geocode);
    }
    return cache;
  }

  private async processRow(
    row: ResolvedPropertyImportRow,
    tenantId: string,
    geocodeCache: Map<string, GeocodeVerification>,
    createdPropertyIds: Map<string, string>,
  ): Promise<ImportRowResult> {
    if (!row.importable) {
      const message = row.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ') || 'Row is not importable';
      return { rowNumber: row.rowNumber, status: 'error', message };
    }

    const plan = row.property;
    if (!plan) {
      return { rowNumber: row.rowNumber, status: 'error', message: 'Row has no resolvable property' };
    }

    if (plan.resolution === 'existing') {
      return { rowNumber: row.rowNumber, status: 'reused', propertyId: plan.propertyId! };
    }

    const key = this.planKey(plan);
    const alreadyCreated = createdPropertyIds.get(key);
    if (alreadyCreated) {
      return { rowNumber: row.rowNumber, status: 'reused', propertyId: alreadyCreated };
    }

    try {
      const property = this.buildProperty(row, plan, tenantId, geocodeCache.get(key) ?? null);
      await this.propertyRepo.save(property);
      if (property.geocodingStatus === 'PENDING') {
        await this.jobQueue.enqueue('property.geocode', { propertyId: property.id });
      }
      createdPropertyIds.set(key, property.id);
      return { rowNumber: row.rowNumber, status: 'created', propertyId: property.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.['target'];
        const isAddressConflict = Array.isArray(target) && target.includes('normalized_address_key');
        if (isAddressConflict) {
          // A concurrent duplicate — someone created a matching address
          // between resolve() and now. Reuse it, same as the resolver would.
          const existing = await this.propertyRepo.findByNormalizedAddress(tenantId, {
            street: plan.street, addressLine2: plan.addressLine2, suburb: plan.suburb, state: plan.state, postcode: plan.postcode,
          });
          if (existing) {
            createdPropertyIds.set(key, existing.id);
            return { rowNumber: row.rowNumber, status: 'reused', propertyId: existing.id };
          }
        }
        return { rowNumber: row.rowNumber, status: 'error', message: 'Property code already exists in this tenant' };
      }
      return { rowNumber: row.rowNumber, status: 'error', message: err instanceof Error ? err.message : 'Unexpected error processing row' };
    }
  }

  private buildProperty(
    row: ResolvedPropertyImportRow,
    plan: NonNullable<ResolvedPropertyImportRow['property']>,
    tenantId: string,
    verification: GeocodeVerification | null,
  ): PropertyEntity {
    const found = verification?.status === 'found' && verification.lat !== null && verification.lng !== null;
    const geocodingStatus = found ? 'SUCCESS' : verification?.status === 'not_found' ? 'FAILED' : 'PENDING';
    const now = new Date();
    return new PropertyEntity({
      id: crypto.randomUUID(),
      tenantId,
      branchId: null,
      propertyCode: row.propertyCode!,
      type: row.type as PropertyType,
      street: plan.street,
      addressLine2: plan.addressLine2,
      suburb: plan.suburb,
      postcode: plan.postcode,
      state: plan.state,
      country: plan.country,
      lat: found ? verification!.lat : null,
      lng: found ? verification!.lng : null,
      geocodingStatus,
      notes: row.notes,
      rulesJson: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }
}
