import { type AuthContext, isAppointmentOverdue } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  PaginationParams,
  AppointmentListItem,
} from '../../domain/appointment.repository';
import { AppointmentCodeFormatter } from '../../domain/appointment-code.formatter';

export interface ListAppointmentsInput {
  filters: {
    tenantId?: string;
    status?: string[];
    serviceTypeId?: string;
    branchId?: string;
    inspectorId?: string;
    propertyId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    tenantConfirmationStatus?: string;
    showCancelled?: boolean;
    overdueOnly?: boolean;
    ungroupedOnly?: boolean;
    timeSlot?: string;
    contactSearch?: string;
    hasTenantNote?: boolean;
    confirmationStatus?: string;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListAppointmentsOutput {
  data: Array<{
    id: string;
    appointmentNumber: number;
    tenantId: string;
    branchId: string;
    propertyId: string;
    serviceTypeId: string;
    inspectorId: string | null;
    status: string;
    scheduledDate: Date;
    timeSlot: string;
    keyRequired: boolean;
    meetingLocation: string | null;
    keyLocation: string | null;
    tenantConfirmationStatus: string;
    priceAmount: number;
    payoutAmount: number;
    notes: string | null;
    createdByUserId: string;
    doneCheckedByUserId: string | null;
    doneCheckedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    // Enriched fields
    /** Formatted appointment code (e.g. "INS-0042"). */
    appointmentCode: string;
    code: string;
    propertyAddress: string;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    inspectorName: string | null;
    tenantName: string;
    branchName: string;
    serviceTypeName: string;
    isOverdue: boolean;
    hasTenantNote: boolean;
    latitude: number | null;
    longitude: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListAppointmentsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListAppointmentsInput): Promise<ListAppointmentsOutput> {
    const { filters, pagination, actor } = input;

    // RBAC: only AM, OP, CL_ADMIN, CL_USER can list appointments
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], { action: 'appointment.list', entityType: 'Appointment' });

    // Resolve tenantId. AM and OP are both cross-tenant per CLAUDE.md §6 —
    // their JWT carries `tenantId: null`, and the `filters.tenantId` query
    // param (when provided) narrows the result set. Tenant-scoped roles
    // (CL_ADMIN, CL_USER, INSP) are pinned to their JWT tenantId and any
    // filter they pass is ignored (defense-in-depth).
    //
    // Bug C-B2 (QA 2026-04-20): the previous branch treated OP like a
    // tenant-scoped role and coerced its (null) tenantId via `!`, silently
    // dropping the query filter and returning the full cross-tenant set
    // regardless of `?tenantId=`.
    const tenantId: string | undefined =
      actor.role === 'AM' || actor.role === 'OP'
        ? filters.tenantId
        : actor.tenantId ?? undefined;

    // When the search term looks like an appointment code (e.g. "INS-0042"),
    // extract the appointment number so the repository can add an OR condition
    // on appointment_number in addition to the regular text search.
    const searchAppointmentNumber = filters.search
      ? AppointmentCodeFormatter.parse(filters.search) ?? undefined
      : undefined;

    const repoFilters: AppointmentFilters = {
      tenantId,
      status: filters.status,
      serviceTypeId: filters.serviceTypeId,
      branchId: filters.branchId,
      inspectorId: filters.inspectorId,
      propertyId: filters.propertyId,
      search: filters.search,
      searchAppointmentNumber,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      tenantConfirmationStatus: filters.tenantConfirmationStatus,
      showCancelled: filters.showCancelled,
      overdueOnly: filters.overdueOnly,
      ungroupedOnly: filters.ungroupedOnly,
      timeSlot: filters.timeSlot,
      contactSearch: filters.contactSearch,
      hasTenantNote: filters.hasTenantNote,
      confirmationStatus: filters.confirmationStatus,
    };

    const [data, total] = await Promise.all([
      this.appointmentRepo.findAll(repoFilters, pagination),
      this.appointmentRepo.count(repoFilters),
    ]);

    return {
      data: data.map((item: AppointmentListItem) => {
        const prefix = item.tenantAppointmentCodePrefix ?? 'INS';
        const padded = String(item.appointment.appointmentNumber).padStart(4, '0');
        const appointmentCode = `${prefix}-${padded}`;
        return {
        id: item.appointment.id,
        appointmentNumber: item.appointment.appointmentNumber,
        tenantId: item.appointment.tenantId,
        branchId: item.appointment.branchId,
        propertyId: item.appointment.propertyId,
        serviceTypeId: item.appointment.serviceTypeId,
        inspectorId: item.appointment.inspectorId,
        status: item.appointment.status,
        scheduledDate: item.appointment.scheduledDate,
        timeSlot: item.appointment.timeSlot,
        keyRequired: item.appointment.keyRequired,
        meetingLocation: item.appointment.meetingLocation,
        keyLocation: item.appointment.keyLocation,
        tenantConfirmationStatus: item.appointment.tenantConfirmationStatus,
        priceAmount: item.appointment.priceAmount,
        payoutAmount: item.appointment.payoutAmount,
        notes: item.appointment.notes,
        createdByUserId: item.appointment.createdByUserId,
        doneCheckedByUserId: item.appointment.doneCheckedByUserId,
        doneCheckedAt: item.appointment.doneCheckedAt,
        createdAt: item.appointment.createdAt,
        updatedAt: item.appointment.updatedAt,
        appointmentCode,
        code: appointmentCode,
        propertyAddress: item.propertyAddress,
        contactName: item.contact?.tenantName ?? '',
        contactPhone: item.contact?.primaryPhone ?? null,
        contactEmail: item.contact?.primaryEmail ?? null,
        inspectorName: item.inspectorName,
        tenantName: item.tenantName,
        branchName: item.branchName,
        serviceTypeName: item.serviceTypeName,
        isOverdue: isAppointmentOverdue(item.appointment.status, item.appointment.scheduledDate),
        hasTenantNote: !!item.appointment.tenantNote,
        latitude: item.propertyLatitude,
        longitude: item.propertyLongitude,
      };
      }),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
