import { type AuthContext, type AvailableSlotSchema, isAppointmentOverdue } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  PaginationParams,
  AppointmentListItem,
} from '../../domain/appointment.repository';
import { AppointmentCodeFormatter } from '../../domain/appointment-code.formatter';
import { APPOINTMENT_LIST_ROLES, resolveAppointmentListTenantScope } from '../appointment-list-scope';

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
    rentalTenantConfirmationStatus?: string[];
    showCancelled?: boolean;
    overdueOnly?: boolean;
    ungroupedOnly?: boolean;
    timeFrom?: string;
    timeTo?: string;
    contactSearch?: string;
    suburb?: string;
    hasRentalTenantNote?: boolean;
    confirmationStatus?: string;
    serviceGroupId?: string;
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
    timeSlotStart: string;
    timeSlotEnd: string;
    keyRequired: boolean;
    meetingLocation: string | null;
    keyLocation: string | null;
    rentalTenantConfirmationStatus: string;
    priceAmount: number;
    payoutAmount: number;
    notes: string | null;
    createdByUserId: string;
    doneCheckedByUserId: string | null;
    doneCheckedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    // Enriched fields
    /** Service group this appointment belongs to (null when ungrouped). */
    serviceGroupId: string | null;
    /** Human-friendly service group code (String(group_number); null when ungrouped). */
    serviceGroupCode: string | null;
    /** Formatted appointment code (e.g. "INS-0042"). */
    appointmentCode: string;
    code: string;
    propertyAddress: string;
    /** The property's own code (e.g. "ACME-PROP-0007"), distinct from `code`. */
    propertyCode: string;
    /** Free-text reason recorded on the last sensitive transition. */
    reason: string | null;
    /** Structured reason code; set when the appointment was CANCELLED. */
    cancellationReasonCode: string | null;
    /** Structured reason code; set when the appointment was REJECTED. */
    rejectionReasonCode: string | null;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    inspectorName: string | null;
    clientName: string;
    branchName: string;
    serviceTypeName: string;
    flowType: string | null;
    isOverdue: boolean;
    hasRentalTenantNote: boolean;
    rentalTenantNote: string | null;
    /**
     * Weekly availability the rental tenant offered when declining in the portal.
     * Null when they offered none — the map's Confirm column renders a greyed
     * icon for that case, so "none" and "missing" must not be conflated.
     */
    rentalTenantAvailableSlots: AvailableSlotSchema[] | null;
    latitude: number | null;
    longitude: number | null;
    /** Property total area in m²; null when the property has no recorded area. */
    propertyTotalAreaM2: number | null;
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
    this.authorizationService.assertRoles(actor, [...APPOINTMENT_LIST_ROLES], { action: 'appointment.list', entityType: 'Appointment' });

    // Bug C-B2 (QA 2026-04-20): an earlier version of this branch treated OP
    // like a tenant-scoped role and coerced its (null) tenantId via `!`,
    // silently dropping the query filter and returning the full cross-tenant
    // set regardless of `?tenantId=`. The rule now lives in one place, shared
    // with the suburbs and export use cases.
    const tenantId = resolveAppointmentListTenantScope(actor, filters.tenantId);

    // When the search term looks like an appointment code — either fully
    // formatted ("INS-0042") or the bare number the operator reads off the
    // screen ("0042", "42") — extract the appointment number so the repository
    // can add an OR condition on appointment_number alongside the text search.
    const searchAppointmentNumber = filters.search
      ? AppointmentCodeFormatter.parseSearchTerm(filters.search) ?? undefined
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
      rentalTenantConfirmationStatus: filters.rentalTenantConfirmationStatus,
      showCancelled: filters.showCancelled,
      overdueOnly: filters.overdueOnly,
      ungroupedOnly: filters.ungroupedOnly,
      timeFrom: filters.timeFrom,
      timeTo: filters.timeTo,
      contactSearch: filters.contactSearch,
      suburb: filters.suburb,
      hasRentalTenantNote: filters.hasRentalTenantNote,
      confirmationStatus: filters.confirmationStatus,
      serviceGroupId: filters.serviceGroupId,
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
        timeSlotStart: item.appointment.timeSlotStart,
        timeSlotEnd: item.appointment.timeSlotEnd,
        keyRequired: item.appointment.keyRequired,
        meetingLocation: item.appointment.meetingLocation,
        keyLocation: item.appointment.keyLocation,
        rentalTenantConfirmationStatus: item.appointment.rentalTenantConfirmationStatus,
        priceAmount: item.appointment.priceAmount,
        payoutAmount: item.appointment.payoutAmount,
        notes: item.appointment.notes,
        createdByUserId: item.appointment.createdByUserId,
        doneCheckedByUserId: item.appointment.doneCheckedByUserId,
        doneCheckedAt: item.appointment.doneCheckedAt,
        createdAt: item.appointment.createdAt,
        updatedAt: item.appointment.updatedAt,
        serviceGroupId: item.appointment.serviceGroupId,
        serviceGroupCode: item.serviceGroupNumber != null ? String(item.serviceGroupNumber) : null,
        appointmentCode,
        code: appointmentCode,
        propertyAddress: item.propertyAddress,
        propertyCode: item.propertyCode,
        reason: item.appointment.reason,
        cancellationReasonCode: item.appointment.cancellationReasonCode,
        rejectionReasonCode: item.appointment.rejectionReasonCode,
        contactName: item.contact?.effectiveName ?? '',
        contactPhone: item.contact?.effectivePhone ?? null,
        contactEmail: item.contact?.effectiveEmail ?? null,
        inspectorName: item.inspectorName,
        clientName: item.tenantName,
        branchName: item.branchName,
        serviceTypeName: item.serviceTypeName,
        flowType: item.serviceTypeFlowType ?? null,
        isOverdue: isAppointmentOverdue({
          status: item.appointment.status,
          createdAt: item.appointment.createdAt,
        }),
        hasRentalTenantNote: !!item.appointment.rentalTenantNote,
        rentalTenantNote: item.appointment.rentalTenantNote ?? null,
        // Collapse both "field absent" and "empty array" to null so the client
        // has a single emptiness check.
        rentalTenantAvailableSlots: item.rentalTenantAvailableSlots?.length
          ? item.rentalTenantAvailableSlots
          : null,
        latitude: item.propertyLatitude,
        longitude: item.propertyLongitude,
        propertyTotalAreaM2: item.propertyTotalAreaM2 ?? null,
      };
      }),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
