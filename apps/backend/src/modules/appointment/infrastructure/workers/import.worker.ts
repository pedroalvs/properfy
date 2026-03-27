import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { IAppointmentImportRepository } from '../../domain/appointment-import.repository';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';
import { AppointmentEntity } from '../../domain/appointment.entity';
import { AppointmentContactEntity } from '../../domain/appointment-contact.entity';
import type { Logger } from '../../../../shared/infrastructure/logger';

interface ImportRow {
  propertyCode?: string;
  serviceTypeCode?: string;
  scheduledDate?: string;
  timeSlot?: string;
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;
  notes?: string;
}

interface RowError {
  row: number;
  field: string;
  message: string;
}

export class AppointmentImportWorker {
  constructor(
    private readonly importRepo: IAppointmentImportRepository,
    private readonly storageService: IReportStorageService,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly logger: Logger,
    private readonly timeSlotRepo?: IAppointmentTimeSlotRepository,
  ) {}

  async execute(data: { importId: string }): Promise<void> {
    const { importId } = data;

    const importRecord = await this.importRepo.findById(importId, null);
    if (!importRecord) {
      this.logger.warn({ importId }, 'Import record not found');
      return;
    }

    await this.importRepo.update(importId, { status: 'PROCESSING' });
    this.logger.info({ importId, fileKey: importRecord.fileKey }, 'Processing appointment import');

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

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2; // 1-indexed + header

        try {
          const created = await this.processRow(
            row,
            rowNum,
            importRecord.tenantId,
            importRecord.createdByUserId,
            errors,
          );
          if (created) {
            successCount++;
          } else {
            errorCount++;
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

      this.logger.info(
        { importId, totalRows: rows.length, successCount, errorCount },
        'Appointment import completed',
      );
    } catch (err) {
      await this.importRepo.update(importId, { status: 'FAILED' });
      this.logger.error({ importId, error: err }, 'Appointment import failed');
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
    createdByUserId: string,
    errors: RowError[],
  ): Promise<boolean> {
    // Validate required fields
    if (!row.propertyCode) {
      errors.push({ row: rowNum, field: 'propertyCode', message: 'Property code is required' });
      return false;
    }
    if (!row.scheduledDate) {
      errors.push({ row: rowNum, field: 'scheduledDate', message: 'Scheduled date is required' });
      return false;
    }
    if (!row.timeSlot) {
      errors.push({ row: rowNum, field: 'timeSlot', message: 'Time slot is required' });
      return false;
    }
    if (!row.tenantName) {
      errors.push({ row: rowNum, field: 'tenantName', message: 'Tenant name is required' });
      return false;
    }

    // Resolve property
    const property = await this.propertyRepo.findByPropertyCode(row.propertyCode, tenantId);
    if (!property) {
      errors.push({ row: rowNum, field: 'propertyCode', message: `Property not found: ${row.propertyCode}` });
      return false;
    }

    // Validate timeSlot against the effective catalog for the property's scope.
    if (this.timeSlotRepo) {
      const scopedSlots = property.branchId
        ? await this.timeSlotRepo.findEffective(tenantId, property.branchId)
        : await this.timeSlotRepo.findAll({ tenantId, branchId: null });
      const slotValid = scopedSlots.some((s) => s.compositeValue === row.timeSlot);
      if (!slotValid) {
        errors.push({
          row: rowNum,
          field: 'timeSlot',
          message: property.branchId
            ? `Time slot "${row.timeSlot}" is not in the configured catalog for this branch`
            : `Time slot "${row.timeSlot}" is not in the tenant default catalog`,
        });
        return false;
      }
    }

    // Resolve service type (optional — use first active if not specified)
    let serviceTypeId: string | null = null;
    if (row.serviceTypeCode) {
      const serviceType = await this.serviceTypeRepo.findByCode(row.serviceTypeCode);
      if (!serviceType) {
        errors.push({ row: rowNum, field: 'serviceTypeCode', message: `Service type not found: ${row.serviceTypeCode}` });
        return false;
      }
      serviceTypeId = serviceType.id;
    }

    // Deduplication check: same property + service type in the last 3 months
    if (serviceTypeId) {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const duplicate = await this.appointmentRepo.findDuplicateForImport(
        property.id, serviceTypeId, tenantId, threeMonthsAgo,
      );
      if (duplicate) {
        errors.push({
          row: rowNum,
          field: 'general',
          message: `Possible duplicate: appointment ${duplicate.id} for same property and service type created within last 3 months`,
        });
        // Warning only — still create the appointment
      }
    }

    // Create appointment in DRAFT status
    const now = new Date();
    const appointmentId = crypto.randomUUID();

    const appointment = new AppointmentEntity({
      id: appointmentId,
      tenantId,
      branchId: property.branchId ?? '',
      propertyId: property.id,
      serviceTypeId: serviceTypeId ?? '',
      inspectorId: null,
      status: 'DRAFT',
      scheduledDate: new Date(row.scheduledDate),
      timeSlot: row.timeSlot,
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      tenantConfirmationStatus: 'PENDING',
      priceAmount: 0,
      payoutAmount: 0,
      pricingRuleSnapshotJson: {},
      notes: row.notes ?? null,
      customFieldsJson: null,
      reason: null,
      cancellationReasonCode: null,
      rejectionReasonCode: null,
      createdByUserId,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.appointmentRepo.save(appointment);

    // Create contact
    const contact = new AppointmentContactEntity({
      id: crypto.randomUUID(),
      appointmentId,
      tenantName: row.tenantName,
      primaryEmail: row.tenantEmail ?? null,
      secondaryEmail: null,
      primaryPhone: row.tenantPhone ?? null,
      secondaryPhone: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.appointmentRepo.saveContact(contact);
    return true;
  }
}
