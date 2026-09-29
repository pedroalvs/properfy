import {
  type AuthContext,
  formatCivilDate,
  formatConfirmationDateCell,
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
 * Upper bound on the numbered "Contact N" column groups appended for non-primary
 * contacts. The primary contact keeps the `Tenant*` columns; up to this many
 * extras get their own Name/Role/Phone/Email columns. Capped so an appointment
 * with an unusually long contact list can't blow the sheet width wide open —
 * the actual count is the max additional contacts in the exported set, clamped
 * here.
 */
const MAX_ADDITIONAL_CONTACT_COLUMNS = 4;

/**
 * Builds the export columns for a given number of additional-contact groups.
 *
 * Mirrors the appointments list (including the columns hidden behind the
 * table's "additional columns" switch) and adds the address parts the table has
 * no room for, plus: numbered columns for non-primary contacts, the tenant
 * confirmation date, and the operator-review flag/date. Kept here rather than
 * reusing the report module's `APPOINTMENTS_COLUMNS`, which is keyed to the
 * report data reader's row shape.
 */
export function buildAppointmentExportColumns(additionalContacts: number): ReportColumn[] {
  const contactColumns: ReportColumn[] = [];
  for (let i = 0; i < additionalContacts; i++) {
    const n = i + 2; // primary is contact 1 (the Tenant* columns)
    contactColumns.push(
      { key: `contact${n}Name`, label: `Contact ${n} Name`, width: 25 },
      { key: `contact${n}Role`, label: `Contact ${n} Role`, width: 20 },
      { key: `contact${n}Phone`, label: `Contact ${n} Phone`, width: 18 },
      { key: `contact${n}Email`, label: `Contact ${n} Email`, width: 30 },
    );
  }

  return [
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
    ...contactColumns,
    { key: 'status', label: 'Status', width: 18 },
    { key: 'confirmationStatus', label: 'Confirmation', width: 16 },
    { key: 'confirmationDate', label: 'Confirmation Date', width: 18 },
    { key: 'reviewed', label: 'Reviewed', width: 10 },
    { key: 'reviewedAt', label: 'Reviewed At', width: 15 },
    { key: 'inspector', label: 'Inspector', width: 25 },
    { key: 'group', label: 'Group', width: 10 },
    { key: 'scheduledDate', label: 'Scheduled Date', width: 15 },
    { key: 'timeSlot', label: 'Time Slot', width: 16 },
    { key: 'cancellationReason', label: 'Cancellation Reason', width: 22 },
    { key: 'reason', label: 'Reason Detail', width: 40 },
    { key: 'createdAt', label: 'Created At', width: 15 },
  ];
}

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

    // One fixed column set for the whole sheet: size it to the row with the most
    // contacts (clamped), so no contact is dropped and thinner rows just leave
    // the trailing Contact columns blank.
    const additionalContacts = Math.min(
      MAX_ADDITIONAL_CONTACT_COLUMNS,
      items.reduce((max, item) => Math.max(max, (item.contacts?.length ?? 1) - 1), 0),
    );

    const buffer = await this.xlsxGenerator.generate(
      buildAppointmentExportColumns(additionalContacts),
      items.map((item) => this.toRow(item, additionalContacts)),
    );

    return {
      filename: `appointments-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentType: XLSX_MIME,
      contentBase64: buffer.toString('base64'),
    };
  }

  private toRow(item: AppointmentListItem, additionalContacts: number): Record<string, unknown> {
    const { appointment } = item;
    const prefix = item.tenantAppointmentCodePrefix ?? 'INS';
    // A CANCELLED row carries a cancellation code and a REJECTED one a rejection
    // code; a single column reads better than two mostly-empty ones.
    const reasonCode = appointment.cancellationReasonCode ?? appointment.rejectionReasonCode;
    // The operator cross-check is the "reviewed" gate the client invoices on.
    const reviewedAt = appointment.doneCheckedAt;

    const row: Record<string, unknown> = {
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
      // Tenant-confirmation timestamp; 'N/A' for flows with no occupant, blank
      // while a routine appointment is still pending (the status column covers that).
      confirmationDate: formatConfirmationDateCell(item.serviceTypeFlowType, item.confirmedAt),
      reviewed: reviewedAt ? 'Yes' : 'No',
      reviewedAt: reviewedAt ? formatInstantDate(reviewedAt) : '',
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

    // Non-primary contacts flattened into numbered columns. Every column the
    // sheet declares must have a key on every row, so fill the full width and
    // leave thinner rows' trailing columns blank. `formatReasonCodeLabel` is a
    // generic SNAKE_CASE→Title Case humanizer, reused here for the role.
    const extraContacts = (item.contacts ?? []).slice(1);
    for (let i = 0; i < additionalContacts; i++) {
      const n = i + 2;
      const contact = extraContacts[i];
      row[`contact${n}Name`] = contact?.effectiveName ?? '';
      row[`contact${n}Role`] = contact ? formatReasonCodeLabel(contact.role) : '';
      row[`contact${n}Phone`] = contact?.effectivePhone ?? '';
      row[`contact${n}Email`] = contact?.effectiveEmail ?? '';
    }

    return row;
  }
}
