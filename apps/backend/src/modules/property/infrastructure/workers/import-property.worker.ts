import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { IPropertyImportRepository } from '../../domain/property-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IPropertyRepository } from '../../domain/property.repository';
import { PropertyEntity } from '../../domain/property.entity';
import type { PropertyType } from '@properfy/shared';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

const VALID_PROPERTY_TYPES = ['APARTMENT', 'HOUSE'];

interface ImportRow {
  propertyCode?: string;
  type?: string;
  street?: string;
  addressLine2?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  country?: string;
  notes?: string;
}

interface RowError {
  row: number;
  field: string;
  message: string;
}

export class ImportPropertyWorker {
  constructor(
    private readonly importRepo: IPropertyImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly propertyRepo: IPropertyRepository,
    private readonly logger: Logger,
    private readonly auditService: AuditService,
    private readonly jobQueue?: IJobQueue,
  ) {}

  async execute(data: { importId: string }): Promise<void> {
    const { importId } = data;

    const importRecord = await this.importRepo.findById(importId, null);
    if (!importRecord) {
      this.logger.warn({ importId }, 'Import record not found');
      return;
    }

    await this.importRepo.update(importId, { status: 'PROCESSING' });
    this.logger.info({ importId, fileKey: importRecord.fileKey }, 'Processing property import');

    try {
      const fileBuffer = await this.storageService.download(importRecord.fileKey);
      const ext = importRecord.originalFilename.split('.').pop()?.toLowerCase();

      let rows: ImportRow[];
      if (ext === 'csv') {
        rows = this.parseCsv(fileBuffer);
      } else {
        rows = await this.parseXlsx(fileBuffer);
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: RowError[] = [];
      const createdPropertyIds: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2; // 1-indexed + header

        try {
          const propertyId = await this.processRow(row, rowNum, importRecord.tenantId, errors);
          if (propertyId) {
            successCount++;
            createdPropertyIds.push(propertyId);
          }
        } catch {
          errorCount++;
          errors.push({ row: rowNum, field: 'general', message: 'Unexpected error processing row' });
        }
      }

      const finalStatus = errorCount > 0 && successCount === 0 ? 'FAILED' : 'COMPLETED';
      await this.importRepo.update(importId, {
        status: finalStatus,
        totalRows: rows.length,
        successCount,
        errorCount,
        errorsJson: errors.length > 0 ? errors : undefined,
      });

      this.auditService.log({
        action: 'property.imported.batch',
        actorType: 'USER',
        actorId: importRecord.createdByUserId,
        entityType: 'PropertyImport',
        entityId: importId,
        tenantId: importRecord.tenantId,
        after: {
          importId,
          totalRows: rows.length,
          successCount,
          errorCount: errors.length,
          propertyIds: createdPropertyIds,
        },
      });

      this.logger.info(
        { importId, totalRows: rows.length, successCount, errorCount },
        'Property import completed',
      );
    } catch (err) {
      await this.importRepo.update(importId, { status: 'FAILED' });
      this.logger.error({ importId, error: err }, 'Property import failed');
      throw err;
    }
  }

  private parseCsv(buffer: Buffer): ImportRow[] {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as ImportRow[];
  }

  private async parseXlsx(buffer: Buffer): Promise<ImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const headers: string[] = [];
    const rows: ImportRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value ?? '').trim();
        });
        return;
      }

      const record: Record<string, string> = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          record[header] = String(cell.value ?? '').trim();
        }
      });
      rows.push(record as unknown as ImportRow);
    });

    return rows;
  }

  private async processRow(
    row: ImportRow,
    rowNum: number,
    tenantId: string,
    errors: RowError[],
  ): Promise<string | undefined> {
    // Validate required fields
    if (!row.propertyCode) {
      errors.push({ row: rowNum, field: 'propertyCode', message: 'Property code is required' });
      return undefined;
    }
    if (!row.type) {
      errors.push({ row: rowNum, field: 'type', message: 'Property type is required' });
      return undefined;
    }
    if (!VALID_PROPERTY_TYPES.includes(row.type.toUpperCase())) {
      errors.push({ row: rowNum, field: 'type', message: `Invalid property type: ${row.type}` });
      return undefined;
    }
    if (!row.street) {
      errors.push({ row: rowNum, field: 'street', message: 'Street is required' });
      return undefined;
    }
    if (!row.suburb) {
      errors.push({ row: rowNum, field: 'suburb', message: 'Suburb is required' });
      return undefined;
    }
    if (!row.postcode) {
      errors.push({ row: rowNum, field: 'postcode', message: 'Postcode is required' });
      return undefined;
    }
    if (!row.state) {
      errors.push({ row: rowNum, field: 'state', message: 'State is required' });
      return undefined;
    }
    if (!row.country) {
      errors.push({ row: rowNum, field: 'country', message: 'Country is required' });
      return undefined;
    }

    // Check uniqueness
    const existing = await this.propertyRepo.findByPropertyCode(row.propertyCode, tenantId);
    if (existing) {
      errors.push({ row: rowNum, field: 'propertyCode', message: `Property code already exists: ${row.propertyCode}` });
      return undefined;
    }

    // Create property
    const now = new Date();
    const property = new PropertyEntity({
      id: crypto.randomUUID(),
      tenantId,
      branchId: null,
      propertyCode: row.propertyCode,
      type: row.type.toUpperCase() as PropertyType,
      street: row.street,
      addressLine2: row.addressLine2 ?? null,
      suburb: row.suburb,
      postcode: row.postcode,
      state: row.state,
      country: row.country,
      lat: null,
      lng: null,
      geocodingStatus: 'PENDING',
      notes: row.notes ?? null,
      rulesJson: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    try {
      await this.propertyRepo.save(property);
    } catch (err: unknown) {
      const isPrismaUniqueViolation =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002';
      if (isPrismaUniqueViolation) {
        errors.push({
          row: rowNum,
          field: 'propertyCode',
          message: 'Property code already exists in this tenant',
        });
        return undefined;
      }
      throw err;
    }

    // Enqueue geocoding job for the newly created property
    if (this.jobQueue) {
      try {
        await this.jobQueue.enqueue('property.geocode', { propertyId: property.id });
        this.logger.info({ propertyId: property.id, rowNum }, 'Enqueued geocoding job for imported property');
      } catch (err) {
        this.logger.warn({ propertyId: property.id, rowNum, error: err }, 'Failed to enqueue geocoding job (non-fatal)');
      }
    }

    return property.id;
  }
}
