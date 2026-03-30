import type { PrismaClient } from '@prisma/client';
import { ServiceGroupStatus as PrismaServiceGroupStatus, PriorityMode as PrismaPriorityMode, ServiceGroupExceptionType as PrismaExceptionType } from '@prisma/client';
import { ServiceGroupEntity } from '../domain/service-group.entity';
import type {
  IServiceGroupRepository,
  ServiceGroupFilters,
  ServiceGroupListItem,
  PaginationParams,
  ServiceGroupWithAppointments,
  MarketplaceOffer,
} from '../domain/service-group.repository';
import type { ServiceGroupStatus, PriorityMode, ServiceGroupExceptionType } from '@properfy/shared';
import type { IServiceRegionRepository } from '../../service-region/domain/service-region.repository';

function mapToEntity(row: any): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: row.id,
    tenantId: row.tenant_id,
    serviceTypeId: row.service_type_id,
    status: row.status as ServiceGroupStatus,
    groupSize: row.group_size,
    offeredCount: row.offered_count,
    confirmedCount: row.confirmed_count,
    scheduledDate: row.scheduled_date,
    timeWindow: row.time_window,
    name: row.name ?? null,
    regionName: row.region_name ?? null,
    description: row.description ?? null,
    priorityMode: row.priority_mode as PriorityMode,
    priorityExpiresAt: row.priority_expires_at,
    exceptionType: (row.exception_type as ServiceGroupExceptionType) ?? null,
    exceptionReason: row.exception_reason ?? null,
    assignedInspectorId: row.assigned_inspector_id,
    publishedAt: row.published_at,
    assignedAt: row.assigned_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaServiceGroupRepository implements IServiceGroupRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly serviceRegionRepo?: IServiceRegionRepository,
  ) {}

  async findById(
    id: string,
    tenantId: string | null,
  ): Promise<ServiceGroupWithAppointments | null> {
    const where: Record<string, unknown> = { id };
    if (tenantId) where['tenant_id'] = tenantId;

    const row = await this.prisma.serviceGroup.findFirst({
      where,
      include: {
        assigned_inspector: {
          select: { id: true, name: true },
        },
        appointments: {
          select: {
            id: true,
            appointment_number: true,
            status: true,
            service_type_id: true,
            tenant_id: true,
            property_id: true,
            service_group_id: true,
          },
        },
      },
    });

    if (!row) return null;

    return {
      group: mapToEntity(row),
      assignedInspectorName: row.assigned_inspector?.name ?? null,
      appointments: row.appointments.map((a: any) => ({
        id: a.id,
        appointmentNumber: a.appointment_number,
        status: a.status,
        serviceTypeId: a.service_type_id,
        tenantId: a.tenant_id,
        propertyId: a.property_id,
        serviceGroupId: a.service_group_id,
      })),
    };
  }

  async findAll(
    filters: ServiceGroupFilters,
    pagination: PaginationParams,
  ): Promise<ServiceGroupListItem[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.serviceGroup.findMany({
      where,
      include: {
        assigned_inspector: {
          select: { id: true, name: true },
        },
      },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [this.mapSortBy(pagination.sortBy)]: pagination.sortOrder,
      },
    });
    return rows.map((row: any) => ({
      group: mapToEntity(row),
      assignedInspectorName: row.assigned_inspector?.name ?? null,
    }));
  }

  async count(filters: ServiceGroupFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.serviceGroup.count({ where });
  }

  async save(group: ServiceGroupEntity): Promise<void> {
    await this.prisma.serviceGroup.create({
      data: {
        id: group.id,
        tenant_id: group.tenantId,
        service_type_id: group.serviceTypeId,
        status: group.status as PrismaServiceGroupStatus,
        group_size: group.groupSize,
        offered_count: group.offeredCount,
        confirmed_count: group.confirmedCount,
        scheduled_date: group.scheduledDate,
        time_window: group.timeWindow,
        priority_mode: group.priorityMode as PrismaPriorityMode,
        priority_expires_at: group.priorityExpiresAt,
        exception_type: group.exceptionType ? (group.exceptionType as PrismaExceptionType) : null,
        exception_reason: group.exceptionReason,
        assigned_inspector_id: group.assignedInspectorId,
        published_at: group.publishedAt,
        assigned_at: group.assignedAt,
        created_by_user_id: group.createdByUserId,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      status: string;
      offeredCount: number;
      confirmedCount: number;
      assignedInspectorId: string | null;
      publishedAt: Date | null;
      assignedAt: Date | null;
      priorityExpiresAt: Date | null;
      name: string | null;
      regionName: string | null;
      description: string | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.offeredCount !== undefined)
      updateData['offered_count'] = data.offeredCount;
    if (data.confirmedCount !== undefined)
      updateData['confirmed_count'] = data.confirmedCount;
    if (data.assignedInspectorId !== undefined)
      updateData['assigned_inspector_id'] = data.assignedInspectorId;
    if (data.publishedAt !== undefined)
      updateData['published_at'] = data.publishedAt;
    if (data.assignedAt !== undefined)
      updateData['assigned_at'] = data.assignedAt;
    if (data.priorityExpiresAt !== undefined)
      updateData['priority_expires_at'] = data.priorityExpiresAt;
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.regionName !== undefined) updateData['region_name'] = data.regionName;
    if (data.description !== undefined) updateData['description'] = data.description;

    await this.prisma.serviceGroup.update({
      where: { id },
      data: updateData,
    });
  }

  async acceptOptimistic(
    id: string,
    inspectorId: string,
    assignedAt: Date,
  ): Promise<number> {
    // Optimistic lock: only update if status is still PUBLISHED
    const result = await this.prisma.serviceGroup.updateMany({
      where: { id, status: 'PUBLISHED' },
      data: {
        status: 'ACCEPTED',
        assigned_inspector_id: inspectorId,
        assigned_at: assignedAt,
      },
    });
    return result.count;
  }

  async findPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorClientEligibility: string[],
    pagination: PaginationParams,
  ): Promise<MarketplaceOffer[]> {
    if (
      inspectorServiceTypes.length === 0 ||
      inspectorClientEligibility.length === 0
    ) {
      return [];
    }

    // Get property IDs in inspector's regions via PostGIS spatial query
    const propertyIds = this.serviceRegionRepo
      ? await this.serviceRegionRepo.findPropertyIdsInInspectorRegions(inspectorId)
      : [];

    const where: Record<string, unknown> = {
      status: 'PUBLISHED',
      service_type_id: { in: inspectorServiceTypes },
      tenant_id: { in: inspectorClientEligibility },
      scheduled_date: { gte: new Date() },
    };

    // Filter by properties in inspector's regions
    if (propertyIds.length > 0) {
      where['appointments'] = {
        some: {
          property_id: { in: propertyIds },
        },
      };
    } else {
      // No properties in inspector's regions means no offers
      return [];
    }

    const rows = await this.prisma.serviceGroup.findMany({
      where,
      include: {
        tenant: { select: { name: true } },
        service_type: { select: { name: true } },
        appointments: {
          select: {
            key_required: true,
            payout_amount: true,
            property: { select: { suburb: true, street: true } },
          },
        },
      },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { scheduled_date: 'asc' },
    });

    return rows.map((row: any) => {
      const appts = row.appointments as any[];
      const suburbs = [
        ...new Set(appts.map((a) => a.property?.suburb).filter(Boolean)),
      ] as string[];
      const addresses = [
        ...new Set(
          appts
            .map((a) => {
              const p = a.property;
              if (!p) return null;
              return [p.street, p.suburb].filter(Boolean).join(', ');
            })
            .filter(Boolean),
        ),
      ] as string[];
      const keyRequired = appts.some((a) => a.key_required === true);
      const payoutTotal = appts.reduce((sum: number, a) => {
        const val = a.payout_amount != null ? parseFloat(a.payout_amount.toString()) : 0;
        return sum + val;
      }, 0);
      const payoutEstimate = payoutTotal > 0 ? payoutTotal : null;
      return {
        groupId: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant?.name ?? '',
        serviceTypeName: row.service_type?.name ?? '',
        groupSize: row.group_size,
        scheduledDate: row.scheduled_date,
        timeWindow: row.time_window,
        priorityMode: row.priority_mode,
        priorityExpiresAt: row.priority_expires_at,
        suburbs,
        addresses,
        keyRequired,
        payoutEstimate,
      };
    });
  }

  async countPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorClientEligibility: string[],
  ): Promise<number> {
    if (
      inspectorServiceTypes.length === 0 ||
      inspectorClientEligibility.length === 0
    ) {
      return 0;
    }

    // Get property IDs in inspector's regions via PostGIS spatial query
    const propertyIds = this.serviceRegionRepo
      ? await this.serviceRegionRepo.findPropertyIdsInInspectorRegions(inspectorId)
      : [];

    if (propertyIds.length === 0) {
      return 0;
    }

    return this.prisma.serviceGroup.count({
      where: {
        status: 'PUBLISHED',
        service_type_id: { in: inspectorServiceTypes },
        tenant_id: { in: inspectorClientEligibility },
        scheduled_date: { gte: new Date() },
        appointments: {
          some: {
            property_id: { in: propertyIds },
          },
        },
      },
    });
  }

  async linkAppointments(
    appointmentIds: string[],
    groupId: string,
  ): Promise<void> {
    await this.prisma.appointment.updateMany({
      where: { id: { in: appointmentIds } },
      data: { service_group_id: groupId },
    });
  }

  async unlinkAppointments(groupId: string): Promise<void> {
    await this.prisma.appointment.updateMany({
      where: { service_group_id: groupId },
      data: { service_group_id: null },
    });
  }

  async revertScheduledAppointments(groupId: string): Promise<number> {
    const result = await this.prisma.appointment.updateMany({
      where: {
        service_group_id: groupId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'AWAITING_INSPECTOR',
        inspector_id: null,
      },
    });
    return result.count;
  }

  async scheduleAppointments(
    groupId: string,
    inspectorId: string,
  ): Promise<number> {
    const result = await this.prisma.appointment.updateMany({
      where: {
        service_group_id: groupId,
        status: 'AWAITING_INSPECTOR',
      },
      data: {
        status: 'SCHEDULED',
        inspector_id: inspectorId,
      },
    });
    return result.count;
  }

  private buildWhere(filters: ServiceGroupFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where['tenant_id'] = filters.tenantId;
    if (filters.status) where['status'] = filters.status;
    if (filters.serviceTypeId)
      where['service_type_id'] = filters.serviceTypeId;
    if (filters.priorityMode) where['priority_mode'] = filters.priorityMode;
    if (filters.scheduledDateFrom || filters.scheduledDateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (filters.scheduledDateFrom)
        dateFilter['gte'] = new Date(filters.scheduledDateFrom);
      if (filters.scheduledDateTo)
        dateFilter['lte'] = new Date(filters.scheduledDateTo);
      where['scheduled_date'] = dateFilter;
    }
    return where;
  }

  private mapSortBy(sortBy?: string): string {
    const mapping: Record<string, string> = {
      scheduledDate: 'scheduled_date',
      scheduled_date: 'scheduled_date',
      createdAt: 'created_at',
      created_at: 'created_at',
      status: 'status',
    };
    return mapping[sortBy ?? ''] ?? 'created_at';
  }
}
