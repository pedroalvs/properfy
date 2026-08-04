import {
  type AuthContext,
  formatCivilDate,
  formatInstantDate,
  formatReasonCodeLabel,
} from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  AppointmentListItem,
} from '../../domain/appointment.repository';
import type { IXlsxGenerator, ReportColumn } from '../../../report/domain/xlsx-generator';
import { ValidationError } from '../../../../shared/domain/errors';
import { AppointmentCodeFormatter } from '../../domain/appointment-code.formatter';
import { APPOINTMENT_LIST_ROLES, resolveAppointmentListTenantScope } from '../appointment-list-scope';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Cap for a single synchronous export, matching the agency financial export.
 * Larger sets must be narrowed with filters so the hot request path never
 * loads/encodes an unbounded history — the async report module owns that case.
 */
const MAX_EXPORT_ROWS = 5000;

/**
 * Mirrors the appointments list (including the columns hidden behind the
 * table's "additional columns" switch) and adds the address parts the table has
 * no room for. Kept here rather than reusing the report module's
 * `APPOINTMENTS_COLUMNS`, which is keyed to the report data reader's row shape.
 */
export const APPOINTMENT_EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'code', label: 'Code', width: 14 },
  { key: 'agency', label: 'Agency', width: 25 },
  { key: 'branch', label: 'Branch', width: 25 },
  { key: 'serviceType', label: 'Service Type', width: 25 },
  { key: 'propertyCode', label: 'Property Code', width: 20 },
  { key: 'propertyAddress', label: 'Address', width: 40 },
  { key: 'suburb', label: 'Suburb', width: 20 },
  { key: 'tenantName', label: 'Tenant', width: 25 },
  { key: 'tenantPhone', label: 'Tenant Phone', width: 18 },
  { key: 'tenantEmail', label: 'Tenant Email', width: 30 },
  { key: 'status', label: 'Status', width: 18 },
  { key: 'confirmationStatus', label: 'Confirmation', width: 16 },
  { key: 'inspector', label: 'Inspector', width: 25 },
  { key: 'group', label: 'Group', width: 10 },
  { key: 'scheduledDate', label: 'Scheduled Date', width: 15 },
  { key: 'timeSlot', label: 'Time Slot', width: 16 },
  { key: 'cancellationReason', label: 'Cancellation Reason', width: 22 },
  { key: 'reason', label: 'Reason Detail', width: 40 },
  { key: 'createdAt', label: 'Created At', width: 15 },
];

export interface ExportAppointmentsInput {
  filters: AppointmentFilters;
  actor: AuthContext;
}

export interface ExportAppointmentsOutput {
  filename: string;
  contentType: string;
  contentBase64: string;
}

/**
 * Synchronous XLSX of the current appointments-list filter set — the "Generate
 * Excel" action. Honours exactly the filters the list honours, so the file
 * always matches what the operator is looking at.
 */
export class ExportAppointmentsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly xlsxGenerator: IXlsxGenerator,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ExportAppointmentsInput): Promise<ExportAppointmentsOutput> {
    const { filters, actor } = input;

    this.authorizationService.assertRoles(actor, [...APPOINTMENT_LIST_ROLES], {
      action: 'appointment.list',
      entityType: 'Appointment',
    });

    const repoFilters: AppointmentFilters = {
      ...filters,
      tenantId: resolveAppointmentListTenantScope(actor, filters.tenantId),
      searchAppointmentNumber: filters.search
        ? AppointmentCodeFormatter.parseSearchTerm(filters.search) ?? undefined
        : undefined,
    };

    // Count first so an over-large set is refused rather than silently
    // truncated — an export that quietly drops rows is worse than no export.
    const total = await this.appointmentRepo.count(repoFilters);
    if (total > MAX_EXPORT_ROWS) {
      throw new ValidationError(
        `This selection has ${total} appointments (max ${MAX_EXPORT_ROWS} per export). Narrow the filters and try again.`,
        [],
      );
    }

    const items = total > 0
      ? await this.appointmentRepo.findAll(repoFilters, {
          page: 1,
          pageSize: total,
          // No sortBy: the list is sorted client-side, so the export inherits
          // the repository's default ordering rather than inventing one.
          sortOrder: 'desc',
        })
      : [];

    const buffer = await this.xlsxGenerator.generate(
      APPOINTMENT_EXPORT_COLUMNS,
      items.map((item) => this.toRow(item)),
    );

    return {
      filename: `appointments-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentType: XLSX_MIME,
      contentBase64: buffer.toString('base64'),
    };
  }

  private toRow(item: AppointmentListItem): Record<string, unknown> {
    const { appointment } = item;
    const prefix = item.tenantAppointmentCodePrefix ?? 'INS';
    // A CANCELLED row carries a cancellation code and a REJECTED one a rejection
    // code; a single column reads better than two mostly-empty ones.
    const reasonCode = appointment.cancellationReasonCode ?? appointment.rejectionReasonCode;

    return {
      code: `${prefix}-${String(appointment.appointmentNumber).padStart(4, '0')}`,
      agency: item.tenantName,
      branch: item.branchName,
      serviceType: item.serviceTypeName,
      propertyCode: item.propertyCode,
      propertyAddress: item.propertyAddress,
      suburb: item.propertySuburb ?? '',
      tenantName: item.contact?.effectiveName ?? '',
      tenantPhone: item.contact?.effectivePhone ?? '',
      tenantEmail: item.contact?.effectiveEmail ?? '',
      status: appointment.status,
      confirmationStatus: appointment.rentalTenantConfirmationStatus,
      inspector: item.inspectorName ?? '',
      group: item.serviceGroupNumber != null ? String(item.serviceGroupNumber) : '',
      scheduledDate: formatCivilDate(appointment.scheduledDate),
      timeSlot: `${appointment.timeSlotStart} - ${appointment.timeSlotEnd}`,
      cancellationReason: formatReasonCodeLabel(reasonCode),
      reason: appointment.reason ?? '',
      // `scheduledDate` is a @db.Date calendar day; `createdAt` is an instant —
      // running the latter through formatCivilDate would report the UTC day and
      // shift every Sydney-evening record back one.
      createdAt: formatInstantDate(appointment.createdAt),
    };
  }
}
