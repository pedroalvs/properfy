import type { AuthContext } from '@properfy/shared';
import {
  ForbiddenError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  PaginationParams,
} from '../../domain/appointment.repository';

export interface ListAppointmentsInput {
  filters: {
    tenantId?: string;
    status?: string;
    serviceTypeId?: string;
    branchId?: string;
    inspectorId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    tenantConfirmationStatus?: string;
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
    createdAt: Date;
    updatedAt: Date;
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

    // Resolve tenantId
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      if (!filters.tenantId) {
        throw new ValidationError('tenantId filter is required for AM/OP roles');
      }
      tenantId = filters.tenantId;
    } else {
      // CL_ADMIN/CL_USER: always use JWT tenantId
      tenantId = actor.tenantId!;
    }

    const repoFilters: AppointmentFilters = {
      tenantId,
      status: filters.status,
      serviceTypeId: filters.serviceTypeId,
      branchId: filters.branchId,
      inspectorId: filters.inspectorId,
      search: filters.search,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      tenantConfirmationStatus: filters.tenantConfirmationStatus,
    };

    const [data, total] = await Promise.all([
      this.appointmentRepo.findAll(repoFilters, pagination),
      this.appointmentRepo.count(repoFilters),
    ]);

    return {
      data: data.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        branchId: a.branchId,
        propertyId: a.propertyId,
        serviceTypeId: a.serviceTypeId,
        inspectorId: a.inspectorId,
        status: a.status,
        scheduledDate: a.scheduledDate,
        timeSlot: a.timeSlot,
        keyRequired: a.keyRequired,
        meetingLocation: a.meetingLocation,
        keyLocation: a.keyLocation,
        tenantConfirmationStatus: a.tenantConfirmationStatus,
        priceAmount: a.priceAmount,
        payoutAmount: a.payoutAmount,
        notes: a.notes,
        createdByUserId: a.createdByUserId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
