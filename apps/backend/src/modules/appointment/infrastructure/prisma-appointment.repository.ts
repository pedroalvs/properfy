import type { PrismaClient } from '@prisma/client';
import type {
  AppointmentStatus as PrismaAppointmentStatus,
  RentalTenantConfirmationStatus as PrismaTenantConfirmationStatus,
  RestrictionSource as PrismaRestrictionSource,
  Prisma,
} from '@prisma/client';
import { AppointmentEntity } from '../domain/appointment.entity';
import { AppointmentContactEntity } from '../domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../domain/appointment-restriction.entity';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  PaginationParams,
  AppointmentWithRelations,
  AppointmentListItem,
  VisibleForInspectorParams,
} from '../domain/appointment.repository';
import { T1VisibilityService } from '../../inspector-execution/domain/t1-visibility.service';
import type {
  AppointmentStatus,
  AvailableSlot,
  RentalTenantConfirmationStatus,
  RestrictionSource,
  CancellationReasonCode,
  RejectionReasonCode,
  AppointmentCustomField,
  ServiceTypeFlowType,
} from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function parseDateOnlyToUtcStart(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
}

function nextUtcDay(date: Date): Date {
  return new Date(date.getTime() + 86_400_000);
}

function mapToEntity(row: any): AppointmentEntity {
  return new AppointmentEntity({
    id: row.id,
    appointmentNumber: row.appointment_number,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    propertyId: row.property_id,
    serviceTypeId: row.service_type_id,
    inspectorId: row.inspector_id,
    status: row.status as AppointmentStatus,
    scheduledDate: row.scheduled_date,
    timeSlotStart: row.time_slot_start,
    timeSlotEnd: row.time_slot_end,
    keyRequired: row.key_required,
    meetingLocation: row.meeting_location,
    keyLocation: row.key_location,
    rentalTenantConfirmationStatus: row.rental_tenant_confirmation_status as RentalTenantConfirmationStatus,
    activeConfirmationCycleId: row.active_confirmation_cycle_id ?? null,
    priceAmount: Number(row.price_amount),
    payoutAmount: Number(row.payout_amount),
    pricingRuleSnapshotJson: (row.pricing_rule_snapshot_json as Record<string, unknown>) ?? {},
    notes: row.notes,
    rentalTenantNote: row.rental_tenant_note ?? null,
    observation: row.observation ?? null,
    // Defensive: the column historically held free-form JSON. Only accept the
    // current `{ label, value }[]` shape; coerce anything else (legacy objects,
    // null) to null so the entity type stays honest.
    customFieldsJson: Array.isArray(row.custom_fields_json)
      ? (row.custom_fields_json as AppointmentCustomField[])
      : null,
    reason: row.reason,
    cancellationReasonCode: (row.cancellation_reason_code as CancellationReasonCode) ?? null,
    rejectionReasonCode: (row.rejection_reason_code as RejectionReasonCode) ?? null,
    createdByUserId: row.created_by_user_id,
    doneMarkedByUserId: row.done_marked_by_user_id,
    doneCheckedByUserId: row.done_checked_by_user_id,
    doneCheckedAt: row.done_checked_at,
    serviceGroupId: row.service_group_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

function mapContactToEntity(row: any): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    contactId: row.contact_id ?? null,
    role: row.role ?? 'RENTAL_TENANT',
    isPrimary: row.is_primary ?? true,
    snapshotName: row.snapshot_name,
    snapshotEmail: row.snapshot_email ?? null,
    snapshotPhone: row.snapshot_phone ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapRestrictionToEntity(row: any): AppointmentRestrictionEntity {
  return new AppointmentRestrictionEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    isHome: row.is_home,
    unavailableDaysJson: row.unavailable_days_json as string[] | null,
    unavailableHoursJson: row.unavailable_hours_json as string[] | null,
    availableSlotsJson: row.available_slots_json as AvailableSlot[] | null,
    notes: row.notes,
    source: row.source as RestrictionSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaAppointmentRepository implements IAppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(
    id: string,
    tenantId: string | null,
  ): Promise<AppointmentWithRelations | null> {
    const where: Record<string, unknown> = { id, deleted_at: null };
    if (tenantId) where['tenant_id'] = tenantId;

    const row = await this.prisma.appointment.findFirst({
      where,
      include: {
        contacts: true,
        restrictions: true,
        property: { select: { property_code: true, street: true, suburb: true, state: true, postcode: true, lat: true, lng: true } },
        tenant: { select: { name: true, appointment_code_prefix: true } },
        branch: { select: { name: true } },
        service_type: { select: { name: true, flow_type: true } },
        inspector: { select: { name: true } },
        service_group: { select: { group_number: true } },
        // AC-2.1: filtered include — only returns a row when status='ACTIVE' AND expires_at > now().
        // Node clock is the authority per AC-2.5 (matches expire-tokens worker convention).
        // Relation field name is `portal_tokens` (Prisma model field); DB table is `rental_tenant_portal_tokens` via @@map.
        portal_tokens: {
          where: { status: 'ACTIVE', expires_at: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!row) return null;

    const appointment = mapToEntity(row);
    // Sort contacts: primary first, then insertion order
    const sortedContacts = [...row.contacts].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.created_at.getTime() - b.created_at.getTime();
    });
    const allContacts = sortedContacts.map(mapContactToEntity);
    const contact = allContacts[0] ?? null;
    const restrictions = row.restrictions.map(mapRestrictionToEntity);

    const propertyAddress = row.property
      ? `${row.property.street}, ${row.property.suburb} ${row.property.state} ${row.property.postcode}`
      : '';

    const tenantAppointmentCodePrefix =
      (row as any).tenant?.appointment_code_prefix ?? null;

    return {
      appointment,
      contact,
      contacts: allContacts,
      restrictions,
      propertyCode: row.property?.property_code ?? '',
      propertyAddress,
      propertySuburb: row.property?.suburb ?? '',
      propertyLatitude: row.property?.lat ? Number(row.property.lat) : null,
      propertyLongitude: row.property?.lng ? Number(row.property.lng) : null,
      branchName: row.branch?.name ?? '',
      serviceTypeName: row.service_type?.name ?? '',
      inspectorName: row.inspector?.name ?? null,
      tenantName: (row as any).tenant?.name ?? '',
      tenantAppointmentCodePrefix,
      hasActivePortalToken: ((row as any).portal_tokens as Array<{ id: string }>).length > 0,
      serviceGroupNumber: (row as any).service_group?.group_number ?? null,
    };
  }

  async findAll(
    filters: AppointmentFilters,
    pagination: PaginationParams,
  ): Promise<AppointmentListItem[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.appointment.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
      include: {
        contacts: {
          select: { id: true, appointment_id: true, contact_id: true, role: true, is_primary: true, snapshot_name: true, snapshot_email: true, snapshot_phone: true, created_at: true, updated_at: true },
          // Deterministic list-display contact: primary first, then insertion order
          // (mirrors findById's in-memory sort). Without this, contacts[0] below is arbitrary.
          orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
        },
        property: { select: { property_code: true, street: true, suburb: true, state: true, postcode: true, lat: true, lng: true } },
        tenant: { select: { name: true, appointment_code_prefix: true } },
        branch: { select: { name: true } },
        service_type: { select: { name: true, flow_type: true } },
        inspector: { select: { name: true } },
        service_group: { select: { group_number: true } },
      },
    });
    return rows.map((row) => {
      const appointment = mapToEntity(row);
      const contact = row.contacts[0] ? mapContactToEntity(row.contacts[0]) : null;
      const propertyAddress = row.property
        ? `${row.property.street}, ${row.property.suburb} ${row.property.state} ${row.property.postcode}`
        : '';
      const tenantAppointmentCodePrefix = row.tenant?.appointment_code_prefix ?? null;
      return {
        appointment,
        contact,
        propertyCode: row.property?.property_code ?? '',
        propertyAddress,
        propertySuburb: row.property?.suburb ?? '',
        propertyLatitude: row.property?.lat != null ? Number(row.property.lat) : null,
        propertyLongitude: row.property?.lng != null ? Number(row.property.lng) : null,
        tenantName: row.tenant?.name ?? '',
        tenantAppointmentCodePrefix,
        branchName: row.branch?.name ?? '',
        serviceTypeName: row.service_type?.name ?? '',
        serviceTypeFlowType: (row.service_type?.flow_type ?? 'ROUTINE') as ServiceTypeFlowType,
        inspectorName: row.inspector?.name ?? null,
        serviceGroupNumber: row.service_group?.group_number ?? null,
      };
    });
  }

  async count(filters: AppointmentFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.appointment.count({ where });
  }

  async save(appointment: AppointmentEntity): Promise<void> {
    await this.prisma.appointment.create({
      data: {
        id: appointment.id,
        tenant_id: appointment.tenantId,
        branch_id: appointment.branchId,
        property_id: appointment.propertyId,
        service_type_id: appointment.serviceTypeId,
        inspector_id: appointment.inspectorId,
        status: appointment.status as PrismaAppointmentStatus,
        scheduled_date: appointment.scheduledDate,
        time_slot_start: appointment.timeSlotStart,
        time_slot_end: appointment.timeSlotEnd,
        key_required: appointment.keyRequired,
        meeting_location: appointment.meetingLocation,
        key_location: appointment.keyLocation,
        rental_tenant_confirmation_status: appointment.rentalTenantConfirmationStatus as PrismaTenantConfirmationStatus,
        price_amount: appointment.priceAmount,
        payout_amount: appointment.payoutAmount,
        pricing_rule_snapshot_json: appointment.pricingRuleSnapshotJson as Prisma.InputJsonValue,
        notes: appointment.notes,
        rental_tenant_note: appointment.rentalTenantNote,
        observation: appointment.observation,
        custom_fields_json: (appointment.customFieldsJson as Prisma.InputJsonValue) ?? undefined,
        reason: appointment.reason,
        created_by_user_id: appointment.createdByUserId,
        done_marked_by_user_id: appointment.doneMarkedByUserId,
        done_checked_by_user_id: appointment.doneCheckedByUserId,
        done_checked_at: appointment.doneCheckedAt,
      },
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<{
      status: string;
      inspectorId: string | null;
      scheduledDate: Date;
      timeSlotStart: string;
      timeSlotEnd: string;
      keyRequired: boolean;
      meetingLocation: string | null;
      keyLocation: string | null;
      rentalTenantConfirmationStatus: string;
      activeConfirmationCycleId: string | null;
      notes: string | null;
      rentalTenantNote: string | null;
      observation: string | null;
      customFieldsJson: AppointmentCustomField[] | null;
      reason: string | null;
      cancellationReasonCode: CancellationReasonCode | null;
      rejectionReasonCode: RejectionReasonCode | null;
      doneMarkedByUserId: string | null;
      doneCheckedByUserId: string | null;
      doneCheckedAt: Date | null;
      serviceGroupId: string | null;
      deletedAt: Date | null;
      branchId: string | null;
      serviceTypeId: string;
      priceAmount: number;
      payoutAmount: number;
      pricingRuleSnapshotJson: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.inspectorId !== undefined) updateData['inspector_id'] = data.inspectorId;
    if (data.scheduledDate !== undefined) updateData['scheduled_date'] = data.scheduledDate;
    if (data.timeSlotStart !== undefined) updateData['time_slot_start'] = data.timeSlotStart;
    if (data.timeSlotEnd !== undefined) updateData['time_slot_end'] = data.timeSlotEnd;
    if (data.keyRequired !== undefined) updateData['key_required'] = data.keyRequired;
    if (data.meetingLocation !== undefined) updateData['meeting_location'] = data.meetingLocation;
    if (data.keyLocation !== undefined) updateData['key_location'] = data.keyLocation;
    if (data.rentalTenantConfirmationStatus !== undefined) {
      updateData['rental_tenant_confirmation_status'] = data.rentalTenantConfirmationStatus;
    }
    if (data.activeConfirmationCycleId !== undefined) {
      updateData['active_confirmation_cycle_id'] = data.activeConfirmationCycleId;
    }
    if (data.notes !== undefined) updateData['notes'] = data.notes;
    if (data.rentalTenantNote !== undefined) updateData['rental_tenant_note'] = data.rentalTenantNote;
    if (data.observation !== undefined) updateData['observation'] = data.observation;
    if (data.customFieldsJson !== undefined) updateData['custom_fields_json'] = data.customFieldsJson;
    if (data.reason !== undefined) updateData['reason'] = data.reason;
    if (data.cancellationReasonCode !== undefined) updateData['cancellation_reason_code'] = data.cancellationReasonCode;
    if (data.rejectionReasonCode !== undefined) updateData['rejection_reason_code'] = data.rejectionReasonCode;
    if (data.doneMarkedByUserId !== undefined) {
      updateData['done_marked_by_user_id'] = data.doneMarkedByUserId;
    }
    if (data.doneCheckedByUserId !== undefined) {
      updateData['done_checked_by_user_id'] = data.doneCheckedByUserId;
    }
    if (data.doneCheckedAt !== undefined) updateData['done_checked_at'] = data.doneCheckedAt;
    if (data.serviceGroupId !== undefined) updateData['service_group_id'] = data.serviceGroupId;
    if (data.deletedAt !== undefined) updateData['deleted_at'] = data.deletedAt;
    if (data.branchId !== undefined) updateData['branch_id'] = data.branchId;
    if (data.serviceTypeId !== undefined) updateData['service_type_id'] = data.serviceTypeId;
    if (data.priceAmount !== undefined) updateData['price_amount'] = data.priceAmount;
    if (data.payoutAmount !== undefined) updateData['payout_amount'] = data.payoutAmount;
    if (data.pricingRuleSnapshotJson !== undefined) updateData['pricing_rule_snapshot_json'] = data.pricingRuleSnapshotJson;

    await this.prisma.appointment.updateMany({
      where: { id, tenant_id: tenantId },
      data: updateData,
    });
  }

  async saveContact(contact: AppointmentContactEntity): Promise<void> {
    await this.prisma.appointmentContact.create({
      data: {
        id: contact.id,
        appointment_id: contact.appointmentId,
        contact_id: contact.contactId,
        role: contact.role as any,
        is_primary: contact.isPrimary,
        snapshot_name: contact.snapshotName,
        snapshot_email: contact.snapshotEmail,
        snapshot_phone: contact.snapshotPhone,
      },
    });
  }

  async updateContactSnapshot(
    appointmentId: string,
    contactJunctionId: string,
    data: Partial<{
      snapshotName: string;
      snapshotEmail: string | null;
      snapshotPhone: string | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.snapshotName !== undefined) updateData['snapshot_name'] = data.snapshotName;
    if (data.snapshotEmail !== undefined) updateData['snapshot_email'] = data.snapshotEmail;
    if (data.snapshotPhone !== undefined) updateData['snapshot_phone'] = data.snapshotPhone;

    await this.prisma.appointmentContact.updateMany({
      where: { id: contactJunctionId, appointment_id: appointmentId },
      data: updateData,
    });
  }

  async deleteContactsByAppointmentId(appointmentId: string): Promise<void> {
    await this.prisma.appointmentContact.deleteMany({
      where: { appointment_id: appointmentId },
    });
  }

  async saveRestriction(restriction: AppointmentRestrictionEntity): Promise<void> {
    await this.prisma.appointmentRestriction.create({
      data: {
        id: restriction.id,
        appointment_id: restriction.appointmentId,
        is_home: restriction.isHome,
        unavailable_days_json: restriction.unavailableDaysJson ?? undefined,
        unavailable_hours_json: restriction.unavailableHoursJson ?? undefined,
        available_slots_json: restriction.availableSlotsJson != null
          ? (restriction.availableSlotsJson as unknown as Prisma.InputJsonValue)
          : undefined,
        notes: restriction.notes,
        source: restriction.source as PrismaRestrictionSource,
      },
    });
  }

  // Cross-tenant: background job processes all tenants for reminders/escalation
  async findScheduledOnDate(date: Date): Promise<AppointmentWithRelations[]> {
    const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    const rows = await this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduled_date: { gte: startOfDay, lt: endOfDay },
        deleted_at: null,
      },
      include: { contacts: true, restrictions: true },
    });

    return rows.map((row) => {
      const appointment = mapToEntity(row);
      const allContacts = row.contacts.map(mapContactToEntity);
      const contact = allContacts[0] ?? null;
      const restrictions = row.restrictions.map(mapRestrictionToEntity);
      return { appointment, contact, contacts: allContacts, restrictions, hasActivePortalToken: false };
    });
  }

  async deleteRestrictionsByAppointmentId(appointmentId: string): Promise<void> {
    await this.prisma.appointmentRestriction.deleteMany({
      where: { appointment_id: appointmentId },
    });
  }

  private buildWhere(filters: AppointmentFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.tenantId) where['tenant_id'] = filters.tenantId;
    if (filters.overdueOnly) {
      where['status'] = { in: ['SCHEDULED', 'AWAITING_INSPECTOR'] };
      const todayUtc = new Date();
      todayUtc.setUTCHours(0, 0, 0, 0);
      where['scheduled_date'] = { lt: todayUtc };
    } else {
      if (filters.status && filters.status.length > 0) {
        where['status'] = { in: filters.status };
      } else if (!filters.showCancelled && !filters.serviceGroupId) {
        // A group-membership query (serviceGroupId set) returns the group's
        // FULL membership, so the default active-status exclusion must not
        // apply — otherwise CANCELLED/REJECTED members would silently vanish
        // and the modal count would disagree with the group pin.
        where['status'] = { notIn: ['CANCELLED', 'REJECTED'] };
      }
      if (filters.fromDate || filters.toDate) {
        const dateFilter: Record<string, unknown> = {};
        if (filters.fromDate) dateFilter['gte'] = parseDateOnlyToUtcStart(filters.fromDate);
        if (filters.toDate) dateFilter['lt'] = nextUtcDay(parseDateOnlyToUtcStart(filters.toDate));
        where['scheduled_date'] = dateFilter;
      }
    }
    if (filters.serviceTypeId) where['service_type_id'] = filters.serviceTypeId;
    if (filters.branchId) where['branch_id'] = filters.branchId;
    if (filters.inspectorId) where['inspector_id'] = filters.inspectorId;
    if (filters.propertyId) where['property_id'] = filters.propertyId;
    if (filters.rentalTenantConfirmationStatus) {
      where['rental_tenant_confirmation_status'] = filters.rentalTenantConfirmationStatus;
    }
    if (filters.search) {
      const orConditions: Record<string, unknown>[] = [
        { notes: { contains: filters.search, mode: 'insensitive' } },
        { property: { property_code: { contains: filters.search, mode: 'insensitive' } } },
        { property: { street: { contains: filters.search, mode: 'insensitive' } } },
        { contacts: { some: { snapshot_name: { contains: filters.search, mode: 'insensitive' } } } },
        { contacts: { some: { snapshot_email: { contains: filters.search, mode: 'insensitive' } } } },
        { contacts: { some: { snapshot_phone: { contains: filters.search } } } },
      ];
      if (filters.searchAppointmentNumber != null) {
        orConditions.push({ appointment_number: filters.searchAppointmentNumber });
      }
      where['OR'] = orConditions;
    }
    if (filters.ungroupedOnly) {
      where['service_group_id'] = null;
      if (!filters.status) {
        where['status'] = { in: ['DRAFT', 'AWAITING_INSPECTOR'] };
      }
    }
    // Positive membership filter. Guarded against `ungroupedOnly` (mutually
    // exclusive — that sets service_group_id = null) so they can't collide.
    if (filters.serviceGroupId && !filters.ungroupedOnly) {
      where['service_group_id'] = filters.serviceGroupId;
    }
    // Free time-range filter: match appointments whose start time falls within
    // [timeFrom, timeTo]. HH:mm strings sort lexicographically == chronologically.
    if (filters.timeFrom || filters.timeTo) {
      const range: Record<string, string> = {};
      if (filters.timeFrom) range['gte'] = filters.timeFrom;
      if (filters.timeTo) range['lte'] = filters.timeTo;
      where['time_slot_start'] = range;
    }
    if (filters.contactSearch) {
      const contactOrConditions: Record<string, unknown>[] = [
        { snapshot_name: { contains: filters.contactSearch, mode: 'insensitive' } },
        { snapshot_email: { contains: filters.contactSearch, mode: 'insensitive' } },
        { snapshot_phone: { contains: filters.contactSearch } },
      ];
      where['contacts'] = { some: { OR: contactOrConditions } };
    }
    if (filters.hasRentalTenantNote === true) {
      // rental_tenant_note IS NOT NULL AND rental_tenant_note != ''
      // Use AND array to combine both conditions without overwriting existing keys
      const existingAnd = Array.isArray(where['AND']) ? (where['AND'] as Record<string, unknown>[]) : [];
      where['AND'] = [
        ...existingAnd,
        { rental_tenant_note: { not: null } },
        { NOT: { rental_tenant_note: '' } },
      ];
    } else if (filters.hasRentalTenantNote === false) {
      // rental_tenant_note IS NULL OR rental_tenant_note = ''
      // Wrap in AND to avoid conflicting with existing OR (from search)
      const existingAnd = Array.isArray(where['AND']) ? (where['AND'] as Record<string, unknown>[]) : [];
      where['AND'] = [
        ...existingAnd,
        { OR: [{ rental_tenant_note: null }, { rental_tenant_note: '' }] },
      ];
    }
    if (filters.confirmationStatus === 'sent') {
      where['notifications'] = {
        some: {
          channel: 'EMAIL',
          template_code: { startsWith: 'INSPECTION_NOTICE' },
          status: { in: ['SENT', 'DELIVERED'] },
        },
      };
    } else if (filters.confirmationStatus === 'not_sent') {
      where['notifications'] = {
        none: {
          channel: 'EMAIL',
          template_code: { startsWith: 'INSPECTION_NOTICE' },
          status: { in: ['SENT', 'DELIVERED'] },
        },
      };
    }
    return where;
  }

  // `findAllContacts`, `countContacts`, `findContactById`, and the
  // `buildContactWhere` helper were retired together with the
  // /v1/appointment-contacts routes — the legacy tenant-wide contacts
  // board UI was retired in 023 and the AppointmentContactsListTab in
  // the chore/ux-baseline-cleanup pass. The contact module owns the
  // canonical Contact CRUD; this module no longer needs a parallel
  // contact read path.

  async findVisibleForInspector(params: VisibleForInspectorParams): Promise<AppointmentListItem[]> {
    const { inspectorId, fromDate, toDate, today } = params;

    const items = await this.findAll(
      { inspectorId, status: ['SCHEDULED'], fromDate, toDate },
      { page: 1, pageSize: 1000, sortBy: 'time_slot_start', sortOrder: 'asc' },
    );

    if (items.length === 0) return [];

    // Load service types for T-1 filtering
    const serviceTypeIds = [...new Set(items.map((i) => i.appointment.serviceTypeId))];
    const serviceTypeRows = await this.prisma.serviceType.findMany({
      where: { id: { in: serviceTypeIds } },
      select: { id: true, flow_type: true },
    });
    const flowTypeMap = new Map(serviceTypeRows.map((st) => [st.id, st.flow_type]));

    const t1Service = new T1VisibilityService();
    return items.filter((item) => {
      const flowType = flowTypeMap.get(item.appointment.serviceTypeId) ?? 'ROUTINE';
      return t1Service.isVisibleForInspector(
        flowType,
        item.appointment.rentalTenantConfirmationStatus,
        item.appointment.keyRequired,
        item.appointment.scheduledDate,
        today,
      );
    });
  }

  async isAppointmentVisibleForInspector(appointmentId: string, today: Date): Promise<boolean> {
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, deleted_at: null },
      include: {
        service_type: { select: { flow_type: true } },
      },
    });
    if (!row) return false;

    const entity = mapToEntity(row);
    const flowType = row.service_type?.flow_type ?? 'ROUTINE';

    const t1Service = new T1VisibilityService();
    return t1Service.isVisibleForInspector(
      flowType,
      entity.rentalTenantConfirmationStatus,
      entity.keyRequired,
      entity.scheduledDate,
      today,
    );
  }

  async findDuplicateForImport(
    propertyId: string,
    serviceTypeId: string,
    tenantId: string,
    sinceDate: Date,
  ): Promise<AppointmentEntity | null> {
    const row = await this.prisma.appointment.findFirst({
      where: {
        property_id: propertyId,
        service_type_id: serviceTypeId,
        tenant_id: tenantId,
        created_at: { gte: sinceDate },
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    return row ? mapToEntity(row) : null;
  }

  async findUnconfirmedForDate(date: Date): Promise<AppointmentEntity[]> {
    const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    const rows = await this.prisma.appointment.findMany({
      where: {
        scheduled_date: { gte: startOfDay, lt: endOfDay },
        rental_tenant_confirmation_status: { not: 'CONFIRMED' },
        status: { notIn: ['DONE', 'CANCELLED', 'REJECTED'] },
        deleted_at: null,
      },
    });

    return rows.map(mapToEntity);
  }
}
