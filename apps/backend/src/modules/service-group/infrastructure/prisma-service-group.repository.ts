import type { PrismaClient } from '@prisma/client';
import type { ServiceGroupStatus as PrismaServiceGroupStatus, PriorityMode as PrismaPriorityMode, ServiceGroupExceptionType as PrismaExceptionType } from '@prisma/client';
import { ServiceGroupEntity } from '../domain/service-group.entity';
import type {
  IServiceGroupRepository,
  ServiceGroupFilters,
  ServiceGroupListItem,
  PaginationParams,
  ServiceGroupWithAppointments,
  ServiceGroupMapAppointment,
  MarketplaceOffer,
  MarketplaceOfferDetail,
  PortalEligibleGroup,
} from '../domain/service-group.repository';
import type { ServiceGroupStatus, PriorityMode, ServiceGroupExceptionType } from '@properfy/shared';
import { resolveCentroid } from '../../../shared/infrastructure/suburb-centroid-resolver';

/**
 * A service group is tenant-agnostic — its tenant set is derived from the
 * linked appointments. `primaryTenantId` is the single agency when the group
 * is single-agency, else null (mixed/cross-agency group).
 */
function deriveTenants(tenantIds: Array<string | null | undefined>): {
  tenantIds: string[];
  primaryTenantId: string | null;
} {
  const distinct = [...new Set(tenantIds.filter((t): t is string => !!t))];
  return { tenantIds: distinct, primaryTenantId: distinct.length === 1 ? distinct[0]! : null };
}

/** Distinct agencies (id + name) from a group's appointments, in first-seen order. */
function deriveAgencies(
  appointments: Array<{ tenant_id?: string | null; tenant?: { name?: string | null } | null }>,
): Array<{ id: string; name: string }> {
  const byId = new Map<string, string>();
  for (const a of appointments) {
    if (a.tenant_id && !byId.has(a.tenant_id)) byId.set(a.tenant_id, a.tenant?.name ?? '');
  }
  return [...byId].map(([id, name]) => ({ id, name }));
}

/**
 * Marketplace offer tenant label, derived from the group's appointments:
 * a single agency → its id + name; multiple → null id + "Multiple agencies".
 */
function deriveOfferTenant(
  appointments: Array<{ tenant_id?: string | null; tenant?: { name?: string | null } | null }>,
): { tenantId: string | null; tenantName: string } {
  const { primaryTenantId } = deriveTenants(appointments.map((a) => a.tenant_id));
  if (primaryTenantId) {
    const name = appointments.find((a) => a.tenant_id === primaryTenantId)?.tenant?.name ?? '';
    return { tenantId: primaryTenantId, tenantName: name };
  }
  return { tenantId: null, tenantName: 'Multiple agencies' };
}

function mapToEntity(row: any): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: row.id,
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
    serviceRegionId: row.service_region_id,
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
  ) {}

  async findById(
    id: string,
    _tenantId: string | null,
  ): Promise<ServiceGroupWithAppointments | null> {
    // Groups are tenant-agnostic; AM/OP are cross-tenant and CL roles have no
    // group access, so the legacy tenant scope is a no-op (kept for the port).
    const row = await this.prisma.serviceGroup.findFirst({
      where: { id },
      include: {
        assigned_inspector: {
          select: { id: true, name: true },
        },
        appointments: {
          select: {
            id: true,
            appointment_number: true,
            status: true,
            scheduled_date: true,
            service_type_id: true,
            tenant_id: true,
            tenant: { select: { name: true } },
            property_id: true,
            service_group_id: true,
            property: {
              select: { street: true, suburb: true, property_code: true },
            },
          },
        },
      },
    });

    if (!row) return null;

    const { tenantIds, primaryTenantId } = deriveTenants(
      row.appointments.map((a: any) => a.tenant_id),
    );
    const agencies = deriveAgencies(row.appointments);

    return {
      group: mapToEntity(row),
      assignedInspectorName: row.assigned_inspector?.name ?? null,
      tenantIds,
      primaryTenantId,
      agencies,
      appointments: row.appointments.map((a: any) => ({
        id: a.id,
        appointmentNumber: a.appointment_number,
        status: a.status,
        serviceTypeId: a.service_type_id,
        tenantId: a.tenant_id,
        propertyId: a.property_id,
        serviceGroupId: a.service_group_id,
        scheduledDate: a.scheduled_date,
        propertyAddress: a.property ? `${a.property.street}, ${a.property.suburb}` : null,
        propertyCode: a.property?.property_code ?? null,
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
    const tenantByGroup = await this.deriveTenantInfoByGroup(rows.map((r: any) => r.id));
    return rows.map((row: any) => {
      const info = tenantByGroup.get(row.id);
      return {
        group: mapToEntity(row),
        assignedInspectorName: row.assigned_inspector?.name ?? null,
        primaryTenantId: info?.primaryTenantId ?? null,
        agencies: info?.agencies ?? [],
      };
    });
  }

  /**
   * Batch-derive each group's tenant info from its linked appointments — one
   * query, no N+1: the distinct agencies, and the primary tenant (single agency
   * id, or null when the group spans multiple agencies).
   */
  private async deriveTenantInfoByGroup(
    groupIds: string[],
  ): Promise<Map<string, { primaryTenantId: string | null; agencies: Array<{ id: string; name: string }> }>> {
    const result = new Map<string, { primaryTenantId: string | null; agencies: Array<{ id: string; name: string }> }>();
    if (groupIds.length === 0) return result;
    const rows = await this.prisma.appointment.findMany({
      where: { service_group_id: { in: groupIds }, deleted_at: null },
      select: { service_group_id: true, tenant_id: true, tenant: { select: { name: true } } },
      distinct: ['service_group_id', 'tenant_id'],
    });
    const byGroup = new Map<string, Map<string, string>>();
    for (const r of rows) {
      if (!r.service_group_id) continue;
      const agencyMap = byGroup.get(r.service_group_id) ?? new Map<string, string>();
      if (!agencyMap.has(r.tenant_id)) agencyMap.set(r.tenant_id, r.tenant?.name ?? '');
      byGroup.set(r.service_group_id, agencyMap);
    }
    for (const id of groupIds) {
      const agencyMap = byGroup.get(id) ?? new Map<string, string>();
      const agencies = [...agencyMap].map(([aid, name]) => ({ id: aid, name }));
      result.set(id, {
        primaryTenantId: agencies.length === 1 ? agencies[0]!.id : null,
        agencies,
      });
    }
    return result;
  }

  async findAppointmentsForMapByGroupIds(
    groupIds: string[],
  ): Promise<ServiceGroupMapAppointment[]> {
    if (groupIds.length === 0) return [];
    const rows = await this.prisma.appointment.findMany({
      where: {
        service_group_id: { in: groupIds },
        deleted_at: null,
      },
      select: {
        id: true,
        service_group_id: true,
        status: true,
        scheduled_date: true,
        property: {
          select: { property_code: true, street: true, suburb: true, lat: true, lng: true },
        },
        inspector: {
          select: { name: true },
        },
      },
    });
    return rows.flatMap((row): ServiceGroupMapAppointment[] => {
      const lat = row.property?.lat != null ? Number(row.property.lat) : null;
      const lng = row.property?.lng != null ? Number(row.property.lng) : null;
      // Skip appointments without coordinates — the map can't render them.
      if (lat == null || lng == null) return [];
      const street = row.property?.street ?? '';
      const suburb = row.property?.suburb ?? '';
      const address = [street, suburb].filter(Boolean).join(', ');
      return [{
        id: row.id,
        serviceGroupId: row.service_group_id ?? '',
        code: row.property?.property_code ?? '',
        status: row.status,
        address,
        latitude: lat,
        longitude: lng,
        scheduledDate: row.scheduled_date,
        inspectorName: row.inspector?.name ?? null,
      }];
    });
  }

  async count(filters: ServiceGroupFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.serviceGroup.count({ where });
  }

  async save(group: ServiceGroupEntity): Promise<void> {
    await this.prisma.serviceGroup.create({
      data: {
        id: group.id,
        service_type_id: group.serviceTypeId,
        status: group.status as PrismaServiceGroupStatus,
        group_size: group.groupSize,
        offered_count: group.offeredCount,
        confirmed_count: group.confirmedCount,
        scheduled_date: group.scheduledDate,
        time_window: group.timeWindow,
        name: group.name,
        region_name: group.regionName,
        description: group.description,
        priority_mode: group.priorityMode as PrismaPriorityMode,
        priority_expires_at: group.priorityExpiresAt,
        exception_type: group.exceptionType ? (group.exceptionType as PrismaExceptionType) : null,
        exception_reason: group.exceptionReason,
        assigned_inspector_id: group.assignedInspectorId,
        service_region_id: group.serviceRegionId,
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
      serviceRegionId: string | null;
      scheduledDate: Date;
      timeWindow: string;
      priorityMode: string;
      exceptionType: string | null;
      exceptionReason: string | null;
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
    if (data.serviceRegionId !== undefined) updateData['service_region_id'] = data.serviceRegionId;
    if (data.scheduledDate !== undefined) updateData['scheduled_date'] = data.scheduledDate;
    if (data.timeWindow !== undefined) updateData['time_window'] = data.timeWindow;
    if (data.priorityMode !== undefined) updateData['priority_mode'] = data.priorityMode;
    if (data.exceptionType !== undefined) updateData['exception_type'] = data.exceptionType;
    if (data.exceptionReason !== undefined) updateData['exception_reason'] = data.exceptionReason;

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
    inspectorBlockedClients: string[],
    pagination: PaginationParams,
  ): Promise<MarketplaceOffer[]> {
    if (inspectorServiceTypes.length === 0) {
      return [];
    }
    // NOTE: empty inspectorBlockedClients is intentionally NOT an early return —
    // an inspector blocked from no one is eligible for all tenants (denylist semantics).

    const offset = (pagination.page - 1) * pagination.pageSize;
    const eligibleIds = await this.findEligibleGroupIds(
      inspectorId,
      inspectorServiceTypes,
      inspectorBlockedClients,
      pagination.pageSize,
      offset,
    );

    if (eligibleIds.length === 0) return [];

    const rows = await this.prisma.serviceGroup.findMany({
      where: { id: { in: eligibleIds } },
      include: {
        service_type: { select: { name: true } },
        appointments: {
          select: {
            payout_amount: true,
            tenant_id: true,
            tenant: { select: { name: true } },
            property: { select: { suburb: true, state: true } },
          },
        },
      },
      orderBy: { scheduled_date: 'asc' },
    });

    return rows.map((row: any) => {
      const appts = row.appointments as any[];
      const { tenantId, tenantName } = deriveOfferTenant(appts);
      const suburbs = [
        ...new Set(appts.map((a) => a.property?.suburb).filter(Boolean)),
      ] as string[];
      const suburbStatePairs = [
        ...new Map(
          appts
            .filter((a) => a.property?.suburb)
            .map((a) => [`${a.property.suburb}|${a.property.state ?? ''}`, { name: a.property.suburb as string, state: (a.property.state ?? '') as string }]),
        ).values(),
      ];
      const payoutTotal = appts.reduce((sum: number, a) => {
        const val = a.payout_amount != null ? parseFloat(a.payout_amount.toString()) : 0;
        return sum + val;
      }, 0);
      const payoutEstimate = payoutTotal > 0 ? payoutTotal : null;
      return {
        groupId: row.id,
        tenantId,
        tenantName,
        serviceTypeName: row.service_type?.name ?? '',
        groupSize: row.group_size,
        scheduledDate: row.scheduled_date,
        timeWindow: row.time_window,
        priorityMode: row.priority_mode,
        priorityExpiresAt: row.priority_expires_at,
        suburbs,
        payoutEstimate,
        appointmentCount: appts.length,
        centroid: resolveCentroid(suburbStatePairs),
      };
    });
  }

  async countPublishedForInspector(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
  ): Promise<number> {
    if (inspectorServiceTypes.length === 0) {
      return 0;
    }

    const rows = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT sg.id) AS count
      FROM service_groups sg
      JOIN appointments a ON a.service_group_id = sg.id
        AND a.deleted_at IS NULL
      JOIN properties p ON p.id = a.property_id
        AND p.deleted_at IS NULL
        AND p.coordinates IS NOT NULL
      JOIN service_regions sr ON (sr.tenant_id = a.tenant_id OR sr.tenant_id IS NULL)
        AND sr.status = 'ACTIVE'
        AND sr.geom IS NOT NULL
        AND ST_Intersects(sr.geom, p.coordinates)
      JOIN inspector_regions ir ON ir.region_id = sr.id
        AND ir.inspector_id = ${inspectorId}
      WHERE sg.status = 'PUBLISHED'
        AND sg.scheduled_date >= CURRENT_DATE
        AND sg.service_type_id = ANY(${inspectorServiceTypes}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM appointments ga
          WHERE ga.service_group_id = sg.id
            AND ga.deleted_at IS NULL
            AND ga.tenant_id = ANY(${inspectorBlockedClients}::text[])
        )
        AND (sg.priority_expires_at IS NULL OR sg.priority_expires_at > NOW())
    `;

    return Number(rows[0]?.count ?? 0);
  }

  async findPublishedOfferDetail(
    groupId: string,
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
  ): Promise<MarketplaceOfferDetail | null> {
    if (inspectorServiceTypes.length === 0) {
      return null;
    }

    // Verify the inspector is eligible for this specific group via spatial join
    const eligibleRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT sg.id
      FROM service_groups sg
      JOIN appointments a ON a.service_group_id = sg.id
        AND a.deleted_at IS NULL
      JOIN properties p ON p.id = a.property_id
        AND p.deleted_at IS NULL
        AND p.coordinates IS NOT NULL
      JOIN service_regions sr ON (sr.tenant_id = a.tenant_id OR sr.tenant_id IS NULL)
        AND sr.status = 'ACTIVE'
        AND sr.geom IS NOT NULL
        AND ST_Intersects(sr.geom, p.coordinates)
      JOIN inspector_regions ir ON ir.region_id = sr.id
        AND ir.inspector_id = ${inspectorId}
      WHERE sg.id = ${groupId}
        AND sg.status = 'PUBLISHED'
        AND sg.scheduled_date >= CURRENT_DATE
        AND sg.service_type_id = ANY(${inspectorServiceTypes}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM appointments ga
          WHERE ga.service_group_id = sg.id
            AND ga.deleted_at IS NULL
            AND ga.tenant_id = ANY(${inspectorBlockedClients}::text[])
        )
        AND (sg.priority_expires_at IS NULL OR sg.priority_expires_at > NOW())
    `;

    if (eligibleRows.length === 0) return null;

    const row = await this.prisma.serviceGroup.findUnique({
      where: { id: groupId },
      include: {
        service_type: { select: { name: true } },
        appointments: {
          select: {
            id: true,
            appointment_number: true,
            key_required: true,
            payout_amount: true,
            notes: true,
            tenant_id: true,
            tenant: { select: { name: true, settings_json: true } },
            property: { select: { suburb: true, state: true, street: true } },
          },
        },
      },
    });

    if (!row) return null;

    const appts = row.appointments as any[];
    const suburbs = [
      ...new Set(appts.map((a) => a.property?.suburb).filter(Boolean)),
    ] as string[];
    const suburbStatePairsDetail = [
      ...new Map(
        appts
          .filter((a) => a.property?.suburb)
          .map((a) => [`${a.property.suburb}|${a.property.state ?? ''}`, { name: a.property.suburb as string, state: (a.property.state ?? '') as string }]),
      ).values(),
    ];
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

    // Collect group-level notes from appointments (first non-null)
    const groupNotes = appts.find((a) => a.notes != null)?.notes ?? null;

    const { tenantId, tenantName } = deriveOfferTenant(appts);

    // Appointment code prefix is per-tenant; a mixed group has appointments from
    // several agencies, so resolve the prefix from each appointment's own tenant.
    const prefixFor = (appt: any): string => {
      const settings = appt.tenant?.settings_json as Record<string, unknown> | null;
      return typeof settings?.appointmentCodePrefix === 'string' && settings.appointmentCodePrefix.length > 0
        ? settings.appointmentCodePrefix
        : 'INS';
    };

    return {
      groupId: row.id,
      tenantId,
      tenantName,
      serviceTypeName: row.service_type?.name ?? '',
      groupSize: row.group_size,
      scheduledDate: row.scheduled_date,
      timeWindow: row.time_window,
      priorityMode: row.priority_mode,
      priorityExpiresAt: row.priority_expires_at,
      suburbs,
      payoutEstimate,
      appointmentCount: appts.length,
      addresses,
      keyRequired,
      notes: groupNotes,
      centroid: resolveCentroid(suburbStatePairsDetail),
      appointments: appts.map((a) => {
        const p = a.property;
        const suburb = p ? [p.suburb, p.state].filter(Boolean).join(' ') : '';
        const payoutVal = a.payout_amount != null ? parseFloat(a.payout_amount.toString()) : null;
        const padded = String(a.appointment_number).padStart(4, '0');
        return {
          id: a.id,
          appointmentCode: `${prefixFor(a)}-${padded}`,
          appointmentNumber: a.appointment_number,
          suburb,
          keyRequired: a.key_required === true,
          notes: a.notes ?? null,
          payoutAmount: payoutVal,
          tenantName: a.tenant?.name ?? '',
        };
      }),
    };
  }

  /**
   * Use PostGIS spatial join to find eligible service group IDs for the inspector.
   * Region matching covers the appointment's own tenant region
   * (sr.tenant_id = a.tenant_id) AND global regions (sr.tenant_id IS NULL); the
   * per-appointment denylist (NOT EXISTS below) still gates global-region offers.
   * The query is cross-tenant because inspectors can have region mappings across tenants.
   */
  private async findEligibleGroupIds(
    inspectorId: string,
    inspectorServiceTypes: string[],
    inspectorBlockedClients: string[],
    limit: number,
    offset: number,
  ): Promise<string[]> {
    // GROUP BY (instead of SELECT DISTINCT) so ORDER BY can reference
    // sg.scheduled_date — Postgres rejects "SELECT DISTINCT … ORDER BY <col not
    // in select list>" with code 42P10. The id tiebreaker keeps pagination stable.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT sg.id
      FROM service_groups sg
      JOIN appointments a ON a.service_group_id = sg.id
        AND a.deleted_at IS NULL
      JOIN properties p ON p.id = a.property_id
        AND p.deleted_at IS NULL
        AND p.coordinates IS NOT NULL
      JOIN service_regions sr ON (sr.tenant_id = a.tenant_id OR sr.tenant_id IS NULL)
        AND sr.status = 'ACTIVE'
        AND sr.geom IS NOT NULL
        AND ST_Intersects(sr.geom, p.coordinates)
      JOIN inspector_regions ir ON ir.region_id = sr.id
        AND ir.inspector_id = ${inspectorId}
      WHERE sg.status = 'PUBLISHED'
        AND sg.scheduled_date >= CURRENT_DATE
        AND sg.service_type_id = ANY(${inspectorServiceTypes}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM appointments ga
          WHERE ga.service_group_id = sg.id
            AND ga.deleted_at IS NULL
            AND ga.tenant_id = ANY(${inspectorBlockedClients}::text[])
        )
        AND (sg.priority_expires_at IS NULL OR sg.priority_expires_at > NOW())
      GROUP BY sg.id, sg.scheduled_date
      ORDER BY sg.scheduled_date ASC, sg.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return rows.map((r) => r.id);
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

  async findExpiredPublished(): Promise<ServiceGroupEntity[]> {
    const rows = await this.prisma.serviceGroup.findMany({
      where: {
        status: 'PUBLISHED',
        priority_expires_at: { lt: new Date() },
      },
    });
    return rows.map((row: any) => mapToEntity(row));
  }

  private buildWhere(filters: ServiceGroupFilters) {
    const where: Record<string, unknown> = {};
    if (filters.status && filters.status.length > 0) where['status'] = { in: filters.status };
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
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Tenant/branch/contact all scope by the group's linked appointments. The
    // group itself is tenant-agnostic, so `tenantId` becomes "has an appointment
    // of this tenant". Each predicate must match at least one appointment, so
    // multiple predicates are combined with AND of separate `some` clauses.
    const appointmentPredicates: Record<string, unknown>[] = [];
    if (filters.tenantId) {
      appointmentPredicates.push({ tenant_id: filters.tenantId, deleted_at: null });
    }
    if (filters.branchId) {
      appointmentPredicates.push({ branch_id: filters.branchId, deleted_at: null });
    }
    if (filters.contactSearch) {
      const contactOrConditions: Record<string, unknown>[] = [
        { snapshot_name: { contains: filters.contactSearch, mode: 'insensitive' } },
        { snapshot_email: { contains: filters.contactSearch, mode: 'insensitive' } },
        { snapshot_phone: { contains: filters.contactSearch } },
        { tenant_name: { contains: filters.contactSearch, mode: 'insensitive' } },
        { primary_email: { contains: filters.contactSearch, mode: 'insensitive' } },
        { primary_phone: { contains: filters.contactSearch } },
      ];
      appointmentPredicates.push({ contacts: { some: { OR: contactOrConditions } }, deleted_at: null });
    }
    if (appointmentPredicates.length === 1) {
      where['appointments'] = { some: appointmentPredicates[0] };
    } else if (appointmentPredicates.length > 1) {
      where['AND'] = appointmentPredicates.map((p) => ({ appointments: { some: p } }));
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

  async decrementConfirmedCount(groupId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE service_groups SET confirmed_count = GREATEST(0, confirmed_count - 1) WHERE id = ${groupId}
    `;
  }

  async incrementConfirmedCount(groupId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE service_groups SET confirmed_count = confirmed_count + 1 WHERE id = ${groupId}
    `;
  }

  async findPortalEligibleGroups(params: {
    tenantId: string;
    serviceTypeId: string;
    propertyId: string;
    today: Date;
  }): Promise<PortalEligibleGroup[]> {
    const todayStr = params.today.toISOString().slice(0, 10);

    type Row = {
      id: string;
      scheduled_date: Date;
      time_window: string;
      suburb: string;
      inspector_name: string;
      confirmed_count: bigint;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT DISTINCT ON (sg.id)
        sg.id,
        sg.scheduled_date,
        sg.time_window,
        p.suburb,
        i.name AS inspector_name,
        sg.confirmed_count
      FROM service_groups sg
      JOIN inspectors i ON i.id = sg.assigned_inspector_id
      JOIN appointments a ON a.service_group_id = sg.id AND a.deleted_at IS NULL
      JOIN properties p ON p.id = a.property_id AND p.deleted_at IS NULL
      WHERE a.tenant_id = ${params.tenantId}
        AND sg.service_type_id = ${params.serviceTypeId}
        AND sg.status = 'ACCEPTED'
        AND sg.confirmed_count < 10
        AND sg.scheduled_date::date > ${todayStr}::date
        AND p.coordinates IS NOT NULL
        AND ST_DWithin(
          p.coordinates::geography,
          (SELECT coordinates::geography FROM properties WHERE id = ${params.propertyId} AND deleted_at IS NULL),
          2000
        )
      ORDER BY sg.id, sg.scheduled_date ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      scheduledDate: row.scheduled_date,
      timeWindow: row.time_window,
      suburb: row.suburb,
      inspectorName: row.inspector_name,
      confirmedCount: Number(row.confirmed_count),
      capacityMax: 10 as const,
    }));
  }

  async findAddableForAppointments(params: {
    serviceTypeId: string;
    scheduledDate: Date;
    timeSlot: string;
    batchSize: number;
  }): Promise<Array<{
    id: string;
    name: string | null;
    status: string;
    scheduledDate: Date;
    timeWindow: string;
    currentSize: number;
    serviceTypeName: string | null;
  }>> {
    const capacity = 30;
    const dateStr = params.scheduledDate.toISOString().slice(0, 10);

    // Use $queryRaw to get appointment count and service type name in one round-trip.
    type Row = {
      id: string;
      name: string | null;
      status: string;
      scheduled_date: Date;
      time_window: string;
      appt_count: bigint;
      service_type_name: string | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        sg.id,
        sg.name,
        sg.status::text,
        sg.scheduled_date,
        sg.time_window,
        sg.service_type_id,
        COUNT(a.id) AS appt_count,
        st.name AS service_type_name
      FROM service_groups sg
      LEFT JOIN appointments a ON a.service_group_id = sg.id AND a.deleted_at IS NULL
      LEFT JOIN service_types st ON st.id = sg.service_type_id
      WHERE sg.service_type_id = ${params.serviceTypeId}
        AND sg.scheduled_date::date = ${dateStr}::date
        AND sg.status IN ('DRAFT', 'PUBLISHED')
      GROUP BY sg.id, sg.name, sg.status, sg.scheduled_date, sg.time_window, sg.service_type_id, st.name
      ORDER BY sg.created_at ASC
    `;

    const [slotStart, slotEnd] = params.timeSlot.split('-');

    return rows
      .filter((row) => {
        const currentSize = Number(row.appt_count);
        if (currentSize + params.batchSize > capacity) return false;
        const [groupStart, groupEnd] = row.time_window.split('-');
        return (slotStart ?? '') >= (groupStart ?? '') && (slotEnd ?? '') <= (groupEnd ?? '');
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        scheduledDate: row.scheduled_date,
        timeWindow: row.time_window,
        currentSize: Number(row.appt_count),
        serviceTypeName: row.service_type_name,
      }));
  }
}
