import { type AuthContext, isAppointmentOverdue } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  PaginationParams,
  AppointmentListItem,
} from '../../domain/appointment.repository';

export interface ListAppointmentsInput {
  filters: {
    tenantId?: string;
    status?: string;
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
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListAppointmentsOutput {
  data: Array<{
    id: string;
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
    code: string;
    propertyAddress: string;
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    inspectorName: string | null;
    branchName: string;
    serviceTypeName: string;
    isOverdue: boolean;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListAppointmentsUseCase {
  constructor(private readonly appointmentRepo: IAppointmentRepository) {}

  async execute(input: ListAppointmentsInput): Promise<ListAppointmentsOutput> {
    const { filters, pagination, actor } = input;

    // RBAC: INSP and TNT are forbidden at list level
    if (actor.role === 'INSP' || actor.role === 'TNT') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'CL_ADMIN' &&
      actor.role !== 'CL_USER'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Resolve tenantId — AM/OP can omit to see all tenants
    const tenantId =
      actor.role === 'AM' || actor.role === 'OP'
        ? filters.tenantId
        : actor.tenantId!;

    const repoFilters: AppointmentFilters = {
      tenantId,
      status: filters.status,
      serviceTypeId: filters.serviceTypeId,
      branchId: filters.branchId,
      inspectorId: filters.inspectorId,
      propertyId: filters.propertyId,
      search: filters.search,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      tenantConfirmationStatus: filters.tenantConfirmationStatus,
      showCancelled: filters.showCancelled,
      overdueOnly: filters.overdueOnly,
      ungroupedOnly: filters.ungroupedOnly,
    };

    const [data, total] = await Promise.all([
      this.appointmentRepo.findAll(repoFilters, pagination),
      this.appointmentRepo.count(repoFilters),
    ]);

    return {
      data: data.map((item: AppointmentListItem) => ({
        id: item.appointment.id,
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
        code: item.propertyCode,
        propertyAddress: item.propertyAddress,
        contactName: item.contact?.tenantName ?? '',
        contactPhone: item.contact?.primaryPhone ?? null,
        contactEmail: item.contact?.primaryEmail ?? null,
        inspectorName: item.inspectorName,
        branchName: item.branchName,
        serviceTypeName: item.serviceTypeName,
        isOverdue: isAppointmentOverdue(item.appointment.status, item.appointment.scheduledDate),
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
