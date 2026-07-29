import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { ServiceGroupStatus as PrismaServiceGroupStatus } from '@prisma/client';
import { ServiceGroupEntity } from '../domain/service-group.entity';
import type {
  IServiceGroupRepository,
  ServiceGroupFilters,
  ServiceGroupListItem,
  PaginationParams,
  ServiceGroupWithAppointments,
  ServiceGroupMapAppointment,
  GroupAppointmentConfirmationRow,
  MarketplaceOffer,
  MarketplaceOfferDetail,
  PortalEligibleGroupMember,
  PortalWindowReservation,
} from '../domain/service-group.repository';
import type { ServiceGroupStatus } from '@properfy/shared';
import { computeWindowAvailability } from '../domain/portal-slot-capacity';
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

/**
 * `groupSize` is passed in rather than read off `row`: there is no stored
 * column for it any more, and each caller derives it differently — `findById`
 * already has the appointment rows in hand, `findAll` asks for a count. Making
 * it a required parameter is what stops a third caller from quietly
 * reintroducing a stale field.
 */
function mapToEntity(row: any, groupSize: number): ServiceGroupEntity {
  return new ServiceGroupEntity({
    id: row.id,
    groupNumber: row.group_number,
    serviceTypeId: row.service_type_id,
    status: row.status as ServiceGroupStatus,
    groupSize,
    offeredCount: row.offered_count,
    confirmedCount: row.confirmed_count,
    scheduledDate: row.scheduled_date,
    timeWindow: row.time_window,
    regionName: row.region_name ?? null,
    description: row.description ?? null,
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

  async findIdsByStatuses(statuses: string[]): Promise<string[]> {
    const rows = await this.prisma.serviceGroup.findMany({
      where: { status: { in: statuses as PrismaServiceGroupStatus[] } },
      select: { id: true },
      // Oldest schedule first so a backlog is worked through in a stable order.
      orderBy: { scheduled_date: 'asc' },
    });
    return rows.map((r) => r.id);
  }

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
          // Soft-deleted appointments keep their `service_group_id` —
          // `delete-appointment` sets `deleted_at` without unlinking — so
          // without this filter they stay in the group's membership and get
          // counted, validated and scheduled as if they still existed.
          where: { deleted_at: null },
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
            // A member's own slot and confirmation state: the group's schedule
            // cascade clamps the former into a changed window, and decides from
            // the latter whether the rental tenant has to be told.
            time_slot_start: true,
            time_slot_end: true,
            rental_tenant_confirmation_status: true,
            active_confirmation_cycle_id: true,
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
      // Counting the rows we just fetched (rather than issuing a separate
      // `_count`) is what guarantees the size can never contradict the
      // `appointments` array returned beside it in the same payload.
      group: mapToEntity(row, row.appointments.length),
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
        timeSlotStart: a.time_slot_start,
        timeSlotEnd: a.time_slot_end,
        rentalTenantConfirmationStatus: a.rental_tenant_confirmation_status,
        activeConfirmationCycleId: a.active_confirmation_cycle_id ?? null,
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
        // The list does not fetch appointment rows, so the size comes from a
        // filtered relation count — same `deleted_at: null` semantics as the
        // detail read, so list and detail can never report different numbers.
        _count: { select: { appointments: { where: { deleted_at: null } } } },
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
        group: mapToEntity(row, row._count?.appointments ?? 0),
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
    return rows.map((row): ServiceGroupMapAppointment => {
      const lat = row.property?.lat != null ? Number(row.property.lat) : null;
      const lng = row.property?.lng != null ? Number(row.property.lng) : null;
      // Un-geocoded appointments are RETURNED (with null coordinates), not
      // dropped: the caller needs the true linked count to explain an empty
      // group pin. Filtering for plottable rows happens in the use case.
      const street = row.property?.street ?? '';
      const suburb = row.property?.suburb ?? '';
      const address = [street, suburb].filter(Boolean).join(', ');
      return {
        id: row.id,
        serviceGroupId: row.service_group_id ?? '',
        code: row.property?.property_code ?? '',
        status: row.status,
        address,
        latitude: lat,
        longitude: lng,
        scheduledDate: row.scheduled_date,
        inspectorName: row.inspector?.name ?? null,
      };
    });
  }

  async findGroupAppointmentsWithConfirmation(
    groupId: string,
  ): Promise<GroupAppointmentConfirmationRow[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { service_group_id: groupId, deleted_at: null },
      orderBy: { appointment_number: 'asc' },
      select: {
        id: true,
        appointment_number: true,
        tenant_id: true,
        status: true,
        scheduled_date: true,
        time_slot_start: true,
        time_slot_end: true,
        rental_tenant_confirmation_status: true,
        active_confirmation_cycle: {
          select: { scheduled_date: true, time_slot: true, status: true },
        },
        property: {
          select: { property_code: true, street: true, suburb: true },
        },
      },
    });
    return rows.map((a): GroupAppointmentConfirmationRow => ({
      id: a.id,
      appointmentNumber: a.appointment_number,
      tenantId: a.tenant_id,
      status: a.status,
      scheduledDate: a.scheduled_date,
      // Appointment-side composite (compared against the group's own `timeWindow`).
      timeSlot: `${a.time_slot_start}-${a.time_slot_end}`,
      rentalTenantConfirmationStatus: a.rental_tenant_confirmation_status,
      activeCycle: a.active_confirmation_cycle
        ? {
            scheduledDate: a.active_confirmation_cycle.scheduled_date,
            timeSlot: a.active_confirmation_cycle.time_slot,
            status: a.active_confirmation_cycle.status,
          }
        : null,
      propertyCode: a.property?.property_code ?? null,
      propertyAddress: a.property ? `${a.property.street}, ${a.property.suburb}` : null,
    }));
  }

  async count(filters: ServiceGroupFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.serviceGroup.count({ where });
  }

  async save(group: ServiceGroupEntity): Promise<void> {
    const created = await this.prisma.serviceGroup.create({
      data: {
        id: group.id,
        service_type_id: group.serviceTypeId,
        status: group.status as PrismaServiceGroupStatus,
        offered_count: group.offeredCount,
        confirmed_count: group.confirmedCount,
        scheduled_date: group.scheduledDate,
        time_window: group.timeWindow,
        region_name: group.regionName,
        description: group.description,
        assigned_inspector_id: group.assignedInspectorId,
        service_region_id: group.serviceRegionId,
        published_at: group.publishedAt,
        assigned_at: group.assignedAt,
        created_by_user_id: group.createdByUserId,
      },
    });
    // Surface the DB-generated sequential code back onto the entity so callers
    // (e.g. create-service-group) can return it in the response.
    group.groupNumber = created.group_number;
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
      regionName: string | null;
      description: string | null;
      serviceRegionId: string | null;
      scheduledDate: Date;
      timeWindow: string;
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
    if (data.regionName !== undefined) updateData['region_name'] = data.regionName;
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.serviceRegionId !== undefined) updateData['service_region_id'] = data.serviceRegionId;
    if (data.scheduledDate !== undefined) updateData['scheduled_date'] = data.scheduledDate;
    if (data.timeWindow !== undefined) updateData['time_window'] = data.timeWindow;

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
          // Matches the offer DETAIL query below. Without it the list counted
          // soft-deleted appointments and summed their payouts, so an offer
          // advertised a bigger job and a bigger payout than the detail view
          // it opened into.
          where: { deleted_at: null },
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
        groupNumber: row.group_number,
        code: String(row.group_number),
        tenantId,
        tenantName,
        serviceTypeName: row.service_type?.name ?? '',
        // Same number as `appointmentCount`. The duplication is deliberate:
        // both fields are in the published contract and consumers read either
        // one, so they must agree rather than one of them being dropped.
        groupSize: appts.length,
        scheduledDate: row.scheduled_date,
        timeWindow: row.time_window,
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
      -- Cross-tenant region match: region ownership is not a filter here; the
      -- inspector->client denylist below is the isolation boundary.
      JOIN service_regions sr ON sr.status = 'ACTIVE'
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
      -- Cross-tenant region match: region ownership is not a filter here; the
      -- inspector->client denylist below is the isolation boundary.
      JOIN service_regions sr ON sr.status = 'ACTIVE'
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
    `;

    if (eligibleRows.length === 0) return null;

    const row = await this.prisma.serviceGroup.findUnique({
      where: { id: groupId },
      include: {
        service_type: { select: { name: true } },
        appointments: {
          where: { deleted_at: null },
          select: {
            id: true,
            appointment_number: true,
            key_required: true,
            payout_amount: true,
            notes: true,
            time_slot_start: true,
            time_slot_end: true,
            tenant_id: true,
            tenant: { select: { name: true, appointment_code_prefix: true } },
            property: {
              select: { deleted_at: true, suburb: true, state: true, street: true, lat: true, lng: true },
            },
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
      return appt.tenant?.appointment_code_prefix || 'INS';
    };

    return {
      groupId: row.id,
      groupNumber: row.group_number,
      code: String(row.group_number),
      tenantId,
      tenantName,
      serviceTypeName: row.service_type?.name ?? '',
      // Same number as `appointmentCount` — see the offers list above.
      groupSize: appts.length,
      scheduledDate: row.scheduled_date,
      timeWindow: row.time_window,
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
          // Never expose location data from a soft-deleted property.
          street: p?.deleted_at == null ? (p?.street ?? '') : '',
          coordinates:
            p?.deleted_at == null && p?.lat != null && p?.lng != null
              ? { lat: Number(p.lat), lng: Number(p.lng) }
              : null,
          keyRequired: a.key_required === true,
          notes: a.notes ?? null,
          payoutAmount: payoutVal,
          tenantName: a.tenant?.name ?? '',
          timeSlotStart: a.time_slot_start,
          timeSlotEnd: a.time_slot_end,
        };
      }),
    };
  }

  /**
   * Use PostGIS spatial join to find eligible service group IDs for the inspector.
   * Region matching is cross-tenant: any ACTIVE region whose polygon contains the
   * property matches, regardless of which agency owns it (region tenant_id is not
   * a matching filter). Client isolation is enforced by the per-appointment
   * inspector->client denylist (NOT EXISTS below), which gates every offer.
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
      -- Cross-tenant region match: region ownership is not a filter here; the
      -- inspector->client denylist below is the isolation boundary.
      JOIN service_regions sr ON sr.status = 'ACTIVE'
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

  async assignInspectorToGroupAppointments(
    groupId: string,
    inspectorId: string,
  ): Promise<{ reassigned: number; scheduled: number }> {
    // Soft-deleted appointments keep their `service_group_id`, so without the
    // `deleted_at` filter a deleted member would be handed to the new
    // inspector and counted as work they owe.
    const [reassigned, scheduled] = await this.prisma.$transaction([
      this.prisma.appointment.updateMany({
        where: { service_group_id: groupId, status: 'SCHEDULED', deleted_at: null },
        data: { inspector_id: inspectorId },
      }),
      this.prisma.appointment.updateMany({
        where: { service_group_id: groupId, status: 'AWAITING_INSPECTOR', deleted_at: null },
        data: { status: 'SCHEDULED', inspector_id: inspectorId },
      }),
    ]);

    return { reassigned: reassigned.count, scheduled: scheduled.count };
  }

  private buildWhere(filters: ServiceGroupFilters) {
    const where: Record<string, unknown> = {};
    if (filters.status && filters.status.length > 0) where['status'] = { in: filters.status };
    if (filters.serviceTypeId)
      where['service_type_id'] = filters.serviceTypeId;
    if (filters.scheduledDateFrom || filters.scheduledDateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (filters.scheduledDateFrom)
        dateFilter['gte'] = new Date(filters.scheduledDateFrom);
      if (filters.scheduledDateTo)
        dateFilter['lte'] = new Date(filters.scheduledDateTo);
      where['scheduled_date'] = dateFilter;
    }
    if (filters.search) {
      const searchOr: Record<string, unknown>[] = [
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
      // Group codes are the pure-numeric group_number, so an all-digit search
      // also matches by code (mirrors appointment_number search).
      const trimmed = filters.search.trim();
      // Bounded to the Postgres Int range so an absurdly long digit string can't blow up the query.
      if (/^\d{1,10}$/.test(trimmed) && Number(trimmed) <= 2_147_483_647) {
        searchOr.push({ group_number: Number(trimmed) });
      }
      where['OR'] = searchOr;
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
        { rental_tenant_name: { contains: filters.contactSearch, mode: 'insensitive' } },
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

  async findPortalEligibleSlots(params: {
    tenantId: string;
    serviceTypeId: string;
    propertyId: string;
    today: Date;
    excludeGroupId?: string | null;
  }): Promise<PortalEligibleGroupMember[]> {
    const todayStr = params.today.toISOString().slice(0, 10);
    const excludeClause = params.excludeGroupId
      ? Prisma.sql`AND sg.id <> ${params.excludeGroupId}`
      : Prisma.empty;

    type Row = {
      group_id: string;
      scheduled_date: Date;
      time_slot_start: string;
      time_slot_end: string;
      suburb: string;
      inspector_name: string;
      is_own_agency: boolean;
    };

    // Rows are per-member, not per-time-slot: how much a window can still take
    // is an interval-packing question over every sibling window in the group,
    // so aggregating here would discard the inputs the rule needs. The caller
    // feeds these to `buildPortalEligibleSlots`.
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH eligible_groups AS (
        SELECT DISTINCT sg.id
        FROM service_groups sg
        JOIN appointments a ON a.service_group_id = sg.id AND a.deleted_at IS NULL
        JOIN properties p ON p.id = a.property_id AND p.deleted_at IS NULL
        WHERE a.tenant_id = ${params.tenantId}
          AND sg.service_type_id = ${params.serviceTypeId}
          ${excludeClause}
          AND sg.status = 'ACCEPTED'
          AND sg.scheduled_date::date > ${todayStr}::date
          AND p.coordinates IS NOT NULL
          AND ST_DWithin(
            p.coordinates::geography,
            (SELECT coordinates::geography FROM properties WHERE id = ${params.propertyId} AND deleted_at IS NULL),
            2000
          )
        )
      SELECT
        sg.id AS group_id,
        a.scheduled_date,
        a.time_slot_start,
        a.time_slot_end,
        p.suburb,
        i.name AS inspector_name,
        (a.tenant_id = ${params.tenantId}) AS is_own_agency
      FROM eligible_groups eg
      JOIN service_groups sg ON sg.id = eg.id
      JOIN inspectors i ON i.id = sg.assigned_inspector_id
      JOIN appointments a ON a.service_group_id = sg.id AND a.deleted_at IS NULL
      JOIN properties p ON p.id = a.property_id AND p.deleted_at IS NULL
      WHERE a.scheduled_date::date > ${todayStr}::date
        AND a.status NOT IN ('CANCELLED', 'REJECTED')
        AND a.time_slot_start IS NOT NULL
        AND a.time_slot_end IS NOT NULL
      ORDER BY a.scheduled_date ASC, a.time_slot_start ASC, a.time_slot_end ASC, sg.id ASC
    `;

    return rows.map((row) => ({
      groupId: row.group_id,
      scheduledDate: row.scheduled_date,
      timeSlotStart: row.time_slot_start,
      timeSlotEnd: row.time_slot_end,
      suburb: row.suburb,
      inspectorName: row.inspector_name,
      isOwnAgency: row.is_own_agency,
    }));
  }

  async reservePortalWindow(params: {
    groupId: string;
    appointmentId: string;
    tenantId: string;
    scheduledDate: string;
    timeSlotStart: string;
    timeSlotEnd: string;
    inspectorId: string;
    rentalTenantNote?: string;
  }): Promise<PortalWindowReservation> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes every concurrent join targeting this group: the next
      // transaction only gets the lock once this one has committed, so it
      // recomputes against an appointment list that already includes this join.
      await tx.$queryRaw`SELECT id FROM service_groups WHERE id = ${params.groupId} FOR UPDATE`;

      type MemberRow = { time_slot_start: string; time_slot_end: string };
      const members = await tx.$queryRaw<MemberRow[]>`
        SELECT a.time_slot_start, a.time_slot_end
        FROM appointments a
        WHERE a.service_group_id = ${params.groupId}
          AND a.deleted_at IS NULL
          AND a.id <> ${params.appointmentId}
          AND a.scheduled_date::date = ${params.scheduledDate}::date
          AND a.status NOT IN ('CANCELLED', 'REJECTED')
          AND a.time_slot_start IS NOT NULL
          AND a.time_slot_end IS NOT NULL
      `;

      const availability = computeWindowAvailability(
        members.map((row) => ({
          timeSlotStart: row.time_slot_start,
          timeSlotEnd: row.time_slot_end,
        })),
        { timeSlotStart: params.timeSlotStart, timeSlotEnd: params.timeSlotEnd },
      );
      if (availability.remaining <= 0) return { ok: false, reason: 'WINDOW_FULL' };

      // Re-assert the target's state here rather than trusting the caller's
      // earlier read: an operator can cancel or delete the appointment while the
      // tenant is choosing. Without these predicates the move would land on a
      // cancelled row and still report success.
      const { count } = await tx.appointment.updateMany({
        where: {
          id: params.appointmentId,
          tenant_id: params.tenantId,
          deleted_at: null,
          status: { notIn: ['CANCELLED', 'DONE', 'REJECTED'] },
        },
        data: {
          scheduled_date: new Date(params.scheduledDate),
          time_slot_start: params.timeSlotStart,
          time_slot_end: params.timeSlotEnd,
          inspector_id: params.inspectorId,
          rental_tenant_confirmation_status: 'CONFIRMED',
          service_group_id: params.groupId,
          ...(params.rentalTenantNote !== undefined
            ? { rental_tenant_note: params.rentalTenantNote }
            : {}),
        },
      });

      // `updateMany` reports zero rows rather than throwing, so without this
      // the caller would go on to bump counters, write audit and notify for a
      // move that never happened.
      if (count !== 1) return { ok: false, reason: 'APPOINTMENT_INACTIVE' };

      return { ok: true };
    });
  }

  async hasPortalMemberSlot(params: {
    groupId: string;
    scheduledDate: string;
    timeSlotStart: string;
    timeSlotEnd: string;
    today: Date;
  }): Promise<boolean> {
    const todayStr = params.today.toISOString().slice(0, 10);

    type Row = { exists: boolean };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT EXISTS (
        SELECT 1
        FROM appointments a
        WHERE a.service_group_id = ${params.groupId}
          AND a.deleted_at IS NULL
          AND a.scheduled_date::date = ${params.scheduledDate}::date
          AND a.scheduled_date::date > ${todayStr}::date
          AND a.time_slot_start = ${params.timeSlotStart}
          AND a.time_slot_end = ${params.timeSlotEnd}
          AND a.time_slot_start IS NOT NULL
          AND a.time_slot_end IS NOT NULL
      ) AS "exists"
    `;

    return rows[0]?.exists === true;
  }

  async findAddableForAppointments(params: {
    serviceTypeId: string;
    batchSize: number;
  }): Promise<Array<{
    id: string;
    groupNumber: number;
    code: string;
    status: string;
    scheduledDate: Date;
    timeWindow: string;
    currentSize: number;
    serviceTypeName: string | null;
  }>> {
    const capacity = 30;

    // Use $queryRaw to get appointment count and service type name in one round-trip.
    type Row = {
      id: string;
      group_number: number;
      status: string;
      scheduled_date: Date;
      time_window: string;
      appt_count: bigint;
      service_type_name: string | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        sg.id,
        sg.group_number,
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
        AND sg.status IN ('DRAFT', 'PUBLISHED')
        AND sg.scheduled_date >= CURRENT_DATE
      GROUP BY sg.id, sg.group_number, sg.status, sg.scheduled_date, sg.time_window, sg.service_type_id, st.name
      ORDER BY sg.created_at ASC
    `;

    // Groups of the right service type with spare capacity. The appointment's
    // own date and time window are intentionally not filters — appointments
    // are re-scheduled to the group's date on join — but past-dated groups
    // are excluded so the sync can never move an appointment into the past.
    return rows
      .filter((row) => {
        const currentSize = Number(row.appt_count);
        return currentSize + params.batchSize <= capacity;
      })
      .map((row) => ({
        id: row.id,
        groupNumber: row.group_number,
        code: String(row.group_number),
        status: row.status,
        scheduledDate: row.scheduled_date,
        timeWindow: row.time_window,
        currentSize: Number(row.appt_count),
        serviceTypeName: row.service_type_name,
      }));
  }
}
