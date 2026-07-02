import { Prisma } from '@prisma/client';
import type { AuthContext, ResolvedImportRow } from '@properfy/shared';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import { PropertyEntity } from '../../../property/domain/property.entity';
import type { AppointmentImportRowResolver } from '../../application/services/appointment-import-row-resolver';
import type { CreateAppointmentUseCase } from '../../application/use-cases/create-appointment.use-case';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { parseAppointmentImportFile } from '../appointment-import-parser';
import { buildNormalizedAddressKey } from '../../../../shared/domain/normalize-address';

interface ImportRowResult {
  rowNumber: number;
  status: 'created' | 'error';
  appointmentId?: string;
  message?: string;
}

export interface AppointmentImportCommitJobData {
  importId: string;
  actorTimezone?: string;
  actor: AuthContext;
}

/**
 * Commits a previewed import: re-resolves the stored file fresh (so a
 * pricing rule deactivated, a property soft-deleted, or a day boundary since
 * preview all reflect current state — TOCTOU rows are reported, not
 * silently imported or aborted), then for each importable row creates a
 * property (if needed) and calls `CreateAppointmentUseCase`. One row's
 * failure never aborts the batch.
 */
export class AppointmentImportCommitWorker {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly propertyRepo: IPropertyRepository,
    private readonly resolver: AppointmentImportRowResolver,
    private readonly createAppointmentUseCase: CreateAppointmentUseCase,
    private readonly jobQueue: IJobQueue,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(data: AppointmentImportCommitJobData): Promise<void> {
    const { importId, actor } = data;
    const tz = data.actorTimezone?.trim() || 'UTC';

    const importRecord = await this.importRepo.findById(importId, null);
    if (!importRecord) {
      this.logger.warn({ importId }, 'Appointment import record not found (swept?)');
      return;
    }
    if (!importRecord.branchId) {
      // Defensive guard — preview always sets branchId; this should be unreachable.
      await this.importRepo.update(importId, { status: 'FAILED' });
      this.logger.error({ importId }, 'Appointment import missing branchId; cannot commit');
      return;
    }

    await this.importRepo.update(importId, { status: 'PROCESSING' });
    this.logger.info({ importId }, 'Committing appointment import');

    // Resume support: a prior partial attempt (worker crash/retry) may have
    // already recorded outcomes for some rows. Carry those forward instead
    // of re-committing them — CreateAppointmentUseCase's own idempotency
    // cache already protects rows that fully completed a prior attempt
    // (including the final .set() call); this closes the narrower gap where
    // a row succeeded but the process crashed before that cache was set.
    const priorResults = Array.isArray(importRecord.resultsJson)
      ? (importRecord.resultsJson as ImportRowResult[])
      : [];
    const priorByRow = new Map(priorResults.map((r) => [r.rowNumber, r]));

    try {
      const fileBuffer = await this.storageService.download(importRecord.fileKey);
      const ext = importRecord.originalFilename.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
      const rawRows = await parseAppointmentImportFile(fileBuffer, ext);

      const { rows } = await this.resolver.resolve(rawRows, {
        tenantId: importRecord.tenantId,
        branchId: importRecord.branchId,
        tz,
      });

      const createdPropertyIds = new Map<string, string>();
      const results: ImportRowResult[] = [];

      for (const row of rows) {
        const prior = priorByRow.get(row.rowNumber);
        if (prior) {
          results.push(prior);
          await this.importRepo.update(importId, { resultsJson: [...results] });
          continue;
        }

        const result = await this.processRow(row, importRecord.tenantId, importRecord.branchId, importId, actor, tz, createdPropertyIds);
        results.push(result);
        // A fresh copy per call — not just cosmetic for tests that snapshot
        // mock-call arguments; it also protects any future repository
        // implementation from an accidental shared-reference mutation.
        await this.importRepo.update(importId, { resultsJson: [...results] });
      }

      const successCount = results.filter((r) => r.status === 'created').length;
      const errorCount = results.filter((r) => r.status === 'error').length;
      const finalStatus = errorCount > 0 && successCount === 0 ? 'FAILED' : 'COMPLETED';

      await this.importRepo.update(importId, {
        status: finalStatus,
        totalRows: rows.length,
        successCount,
        errorCount,
        resultsJson: [...results],
      });

      this.auditService.log({
        action: 'appointment.imported.batch',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'AppointmentImport',
        entityId: importId,
        tenantId: importRecord.tenantId,
        after: { totalRows: rows.length, successCount, errorCount },
      });

      this.logger.info({ importId, totalRows: rows.length, successCount, errorCount }, 'Appointment import commit completed');
    } catch (err) {
      await this.importRepo.update(importId, { status: 'FAILED' });
      this.logger.error({ importId, error: err }, 'Appointment import commit failed');
      throw err;
    }
  }

  private async processRow(
    row: ResolvedImportRow,
    tenantId: string,
    branchId: string,
    importId: string,
    actor: AuthContext,
    tz: string,
    createdPropertyIds: Map<string, string>,
  ): Promise<ImportRowResult> {
    if (!row.importable) {
      const message = row.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ') || 'Row is not importable';
      return { rowNumber: row.rowNumber, status: 'error', message };
    }

    try {
      const propertyId = await this.resolveOrCreateProperty(row, tenantId, createdPropertyIds);

      const appointment = await this.createAppointmentUseCase.execute({
        branchId,
        propertyId,
        serviceTypeId: row.serviceTypeId!,
        scheduledDate: row.scheduledDate,
        timeSlotStart: row.timeSlotStart,
        timeSlotEnd: row.timeSlotEnd,
        contacts: [{
          inline: {
            type: 'RENTAL_TENANT',
            displayName: row.contact!.displayName,
            primaryEmail: row.contact!.primaryEmail,
            primaryPhone: row.contact!.primaryPhone,
            additionalChannels: row.contact!.additionalChannels,
          },
          role: 'RENTAL_TENANT',
          isPrimary: true,
        }],
        customFields: row.customFields.length > 0 ? row.customFields : undefined,
        keyRequired: false,
        notes: row.notes ?? undefined,
        idempotencyKey: `import:${importId}:row:${row.rowNumber}`,
        actorTimezone: tz,
        skipTimeInPastCheck: true,
        actor,
      });

      return { rowNumber: row.rowNumber, status: 'created', appointmentId: appointment.id };
    } catch (err) {
      return { rowNumber: row.rowNumber, status: 'error', message: err instanceof Error ? err.message : 'Unexpected error processing row' };
    }
  }

  /** Resolves the row's property to a concrete id — reusing an existing
   * match, or creating one directly via the repository (bypassing
   * `CreatePropertyUseCase`'s synchronous ~4s Mapbox geocode; an async
   * `property.geocode` job is enqueued instead, mirroring the property
   * importer). Tracks intra-batch creation so two rows sharing a new
   * address create exactly one property. */
  private async resolveOrCreateProperty(
    row: ResolvedImportRow,
    tenantId: string,
    createdPropertyIds: Map<string, string>,
  ): Promise<string> {
    const plan = row.property!;
    if (plan.resolution === 'existing') {
      return plan.propertyId!;
    }

    const addr = {
      street: plan.street, addressLine2: plan.addressLine2, suburb: plan.suburb, state: plan.state, postcode: plan.postcode,
    };
    // Reuse the SAME key builder as the DB trigger and the resolver's own
    // intra-batch dedupe — a hand-rolled equivalent here would silently
    // drift from the canonical normalization if either one ever changes.
    const key = buildNormalizedAddressKey(addr);
    const alreadyCreated = createdPropertyIds.get(key);
    if (alreadyCreated) return alreadyCreated;

    const now = new Date();
    const property = new PropertyEntity({
      id: crypto.randomUUID(),
      tenantId,
      branchId: null,
      propertyCode: `IMP-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      type: 'RESIDENTIAL',
      street: addr.street,
      addressLine2: addr.addressLine2,
      suburb: addr.suburb,
      postcode: addr.postcode,
      state: addr.state,
      country: plan.country,
      lat: null,
      lng: null,
      geocodingStatus: 'PENDING',
      notes: null,
      rulesJson: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    try {
      await this.propertyRepo.save(property);
      await this.jobQueue.enqueue('property.geocode', { propertyId: property.id });
      createdPropertyIds.set(key, property.id);
      return property.id;
    } catch (err) {
      // A genuine concurrent duplicate — another process (or a retried job)
      // created a matching address between this batch's resolve() and now.
      // Any other error (e.g. the near-impossible property_code collision)
      // is left to fail the row via the outer try/catch.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.['target'];
        const isAddressConflict = Array.isArray(target) && target.includes('normalized_address_key');
        if (isAddressConflict) {
          const existing = await this.propertyRepo.findByNormalizedAddress(tenantId, addr);
          if (existing) {
            createdPropertyIds.set(key, existing.id);
            return existing.id;
          }
        }
      }
      throw err;
    }
  }
}
