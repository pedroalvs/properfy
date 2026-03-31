import type { PrismaClient } from '@prisma/client';
import {
  AppointmentStatus as PrismaAppointmentStatus,
  TenantConfirmationStatus as PrismaTenantConfirmationStatus,
  RestrictionSource as PrismaRestrictionSource,
  Prisma,
} from '@prisma/client';
import { AppointmentEntity } from '../domain/appointment.entity';
import { AppointmentContactEntity } from '../domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../domain/appointment-restriction.entity';
import type {
  IAppointmentRepository,
  AppointmentFilters,
  ContactFilters,
  PaginationParams,
  AppointmentWithRelations,
  AppointmentListItem,
  ContactListItem,
  ContactDetail,
} from '../domain/appointment.repository';
import type {
  AppointmentStatus,
  TenantConfirmationStatus,
  RestrictionSource,
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
    timeSlot: row.time_slot,
    keyRequired: row.key_required,
    meetingLocation: row.meeting_location,
    keyLocation: row.key_location,
    tenantConfirmationStatus: row.tenant_confirmation_status as TenantConfirmationStatus,
    priceAmount: Number(row.price_amount),
    payoutAmount: Number(row.payout_amount),
    pricingRuleSnapshotJson: (row.pricing_rule_snapshot_json as Record<string, unknown>) ?? {},
    notes: row.notes,
    customFieldsJson: row.custom_fields_json as Record<string, unknown> | null,
    reason: row.reason,
    cancellationReasonCode: row.cancellation_reason_code ?? null,
    rejectionReasonCode: row.rejection_reason_code ?? null,
    createdByUserId: row.created_by_user_id,
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
    tenantName: row.tenant_name,
    primaryEmail: row.primary_email,
    secondaryEmail: row.secondary_email,
    primaryPhone: row.primary_phone,
    secondaryPhone: row.secondary_phone,
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
        contact: true,
        restrictions: true,
        property: { select: { property_code: true, street: true, suburb: true, state: true, postcode: true, lat: true, lng: true } },
        branch: { select: { name: true } },
        service_type: { select: { name: true } },
        inspector: { select: { name: true } },
      },
    });

    if (!row) return null;

    const appointment = mapToEntity(row);
    const contact = row.contact ? mapContactToEntity(row.contact) : null;
    const restrictions = row.restrictions.map(mapRestrictionToEntity);

    const propertyAddress = row.property
      ? `${row.property.street}, ${row.property.suburb} ${row.property.state} ${row.property.postcode}`
      : '';

    return {
      appointment,
      contact,
      restrictions,
      propertyCode: row.property?.property_code ?? '',
      propertyAddress,
      propertySuburb: row.property?.suburb ?? '',
      propertyLatitude: row.property?.lat ? Number(row.property.lat) : null,
      propertyLongitude: row.property?.lng ? Number(row.property.lng) : null,
      branchName: row.branch?.name ?? '',
      serviceTypeName: row.service_type?.name ?? '',
      inspectorName: row.inspector?.name ?? null,
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
        contact: { select: { tenant_name: true, primary_phone: true, primary_email: true } },
        property: { select: { property_code: true, street: true, suburb: true, state: true, postcode: true } },
        tenant: { select: { name: true } },
        branch: { select: { name: true } },
        service_type: { select: { name: true } },
        inspector: { select: { name: true } },
      },
    });
    return rows.map((row) => {
      const appointment = mapToEntity(row);
      const contact = row.contact ? mapContactToEntity(row.contact) : null;
      const propertyAddress = row.property
        ? `${row.property.street}, ${row.property.suburb} ${row.property.state} ${row.property.postcode}`
        : '';
      return {
        appointment,
        contact,
        propertyCode: row.property?.property_code ?? '',
        propertyAddress,
        tenantName: row.tenant?.name ?? '',
        branchName: row.branch?.name ?? '',
        serviceTypeName: row.service_type?.name ?? '',
        inspectorName: row.inspector?.name ?? null,
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
        time_slot: appointment.timeSlot,
        key_required: appointment.keyRequired,
        meeting_location: appointment.meetingLocation,
        key_location: appointment.keyLocation,
        tenant_confirmation_status: appointment.tenantConfirmationStatus as PrismaTenantConfirmationStatus,
        price_amount: appointment.priceAmount,
        payout_amount: appointment.payoutAmount,
        pricing_rule_snapshot_json: appointment.pricingRuleSnapshotJson as Prisma.InputJsonValue,
        notes: appointment.notes,
        custom_fields_json: (appointment.customFieldsJson as Prisma.InputJsonValue) ?? undefined,
        reason: appointment.reason,
        created_by_user_id: appointment.createdByUserId,
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
      timeSlot: string;
      keyRequired: boolean;
      meetingLocation: string | null;
      keyLocation: string | null;
      tenantConfirmationStatus: string;
      notes: string | null;
      customFieldsJson: Record<string, unknown> | null;
      reason: string | null;
      cancellationReasonCode: string | null;
      rejectionReasonCode: string | null;
      doneCheckedByUserId: string | null;
      doneCheckedAt: Date | null;
      serviceGroupId: string | null;
      deletedAt: Date | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.inspectorId !== undefined) updateData['inspector_id'] = data.inspectorId;
    if (data.scheduledDate !== undefined) updateData['scheduled_date'] = data.scheduledDate;
    if (data.timeSlot !== undefined) updateData['time_slot'] = data.timeSlot;
    if (data.keyRequired !== undefined) updateData['key_required'] = data.keyRequired;
    if (data.meetingLocation !== undefined) updateData['meeting_location'] = data.meetingLocation;
    if (data.keyLocation !== undefined) updateData['key_location'] = data.keyLocation;
    if (data.tenantConfirmationStatus !== undefined) {
      updateData['tenant_confirmation_status'] = data.tenantConfirmationStatus;
    }
    if (data.notes !== undefined) updateData['notes'] = data.notes;
    if (data.customFieldsJson !== undefined) updateData['custom_fields_json'] = data.customFieldsJson;
    if (data.reason !== undefined) updateData['reason'] = data.reason;
    if (data.cancellationReasonCode !== undefined) updateData['cancellation_reason_code'] = data.cancellationReasonCode;
    if (data.rejectionReasonCode !== undefined) updateData['rejection_reason_code'] = data.rejectionReasonCode;
    if (data.doneCheckedByUserId !== undefined) {
      updateData['done_checked_by_user_id'] = data.doneCheckedByUserId;
    }
    if (data.doneCheckedAt !== undefined) updateData['done_checked_at'] = data.doneCheckedAt;
    if (data.serviceGroupId !== undefined) updateData['service_group_id'] = data.serviceGroupId;
    if (data.deletedAt !== undefined) updateData['deleted_at'] = data.deletedAt;

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
        tenant_name: contact.tenantName,
        primary_email: contact.primaryEmail,
        secondary_email: contact.secondaryEmail,
        primary_phone: contact.primaryPhone,
        secondary_phone: contact.secondaryPhone,
      },
    });
  }

  async updateContact(
    appointmentId: string,
    data: Partial<{
      tenantName: string;
      primaryEmail: string | null;
      secondaryEmail: string | null;
      primaryPhone: string | null;
      secondaryPhone: string | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.tenantName !== undefined) updateData['tenant_name'] = data.tenantName;
    if (data.primaryEmail !== undefined) updateData['primary_email'] = data.primaryEmail;
    if (data.secondaryEmail !== undefined) updateData['secondary_email'] = data.secondaryEmail;
    if (data.primaryPhone !== undefined) updateData['primary_phone'] = data.primaryPhone;
    if (data.secondaryPhone !== undefined) updateData['secondary_phone'] = data.secondaryPhone;

    await this.prisma.appointmentContact.update({
      where: { appointment_id: appointmentId },
      data: updateData,
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
      include: { contact: true, restrictions: true },
    });

    return rows.map((row) => {
      const appointment = mapToEntity(row);
      const contact = row.contact ? mapContactToEntity(row.contact) : null;
      const restrictions = row.restrictions.map(mapRestrictionToEntity);
      return { appointment, contact, restrictions };
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
      if (filters.status) {
        where['status'] = filters.status;
      } else if (!filters.showCancelled) {
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
    if (filters.tenantConfirmationStatus) {
      where['tenant_confirmation_status'] = filters.tenantConfirmationStatus;
    }
    if (filters.search) {
      where['OR'] = [
        { notes: { contains: filters.search, mode: 'insensitive' } },
        { property: { property_code: { contains: filters.search, mode: 'insensitive' } } },
        { property: { street: { contains: filters.search, mode: 'insensitive' } } },
        { contact: { tenant_name: { contains: filters.search, mode: 'insensitive' } } },
        { contact: { primary_phone: { contains: filters.search, mode: 'insensitive' } } },
        { contact: { primary_email: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.ungroupedOnly) {
      where['service_group_id'] = null;
      if (!filters.status) {
        where['status'] = { in: ['DRAFT', 'AWAITING_INSPECTOR'] };
      }
    }
    return where;
  }

  async findAllContacts(filters: ContactFilters, pagination: PaginationParams): Promise<ContactListItem[]> {
    const where = this.buildContactWhere(filters);
    const rows = await this.prisma.appointmentContact.findMany({
      where,
      include: {
        appointment: {
          include: {
            property: true,
            portal_activities: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
      },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { appointment: { scheduled_date: pagination.sortOrder } },
    });

    return rows.map((row) => {
      const appt = row.appointment;
      const prop = appt.property;
      const propertyAddress = [prop.street, prop.suburb, prop.state, prop.postcode]
        .filter(Boolean)
        .join(', ');
      const lastActivity = appt.portal_activities[0]?.created_at ?? null;
      return {
        id: row.id,
        appointmentId: appt.id,
        name: row.tenant_name,
        primaryEmail: row.primary_email,
        primaryPhone: row.primary_phone,
        confirmationStatus: appt.tenant_confirmation_status,
        propertyAddress,
        appointmentDate: appt.scheduled_date,
        lastActivityAt: lastActivity,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async countContacts(filters: ContactFilters): Promise<number> {
    const where = this.buildContactWhere(filters);
    return this.prisma.appointmentContact.count({ where });
  }

  async findContactById(id: string): Promise<ContactDetail | null> {
    const row = await this.prisma.appointmentContact.findUnique({
      where: { id },
      include: {
        appointment: {
          include: {
            property: true,
            portal_activities: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!row) return null;

    const appt = row.appointment;
    const prop = appt.property;
    const propertyAddress = [prop.street, prop.suburb, prop.state, prop.postcode]
      .filter(Boolean)
      .join(', ');
    const lastActivity = appt.portal_activities[0]?.created_at ?? null;

    return {
      id: row.id,
      appointmentId: appt.id,
      name: row.tenant_name,
      primaryEmail: row.primary_email,
      primaryPhone: row.primary_phone,
      alternativePhone: row.secondary_phone,
      confirmationStatus: appt.tenant_confirmation_status,
      propertyAddress,
      appointmentDate: appt.scheduled_date,
      lastActivityAt: lastActivity,
      notes: appt.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private buildContactWhere(filters: ContactFilters) {
    const where: Record<string, unknown> = { appointment: { deleted_at: null } };
    if (filters.tenantId) {
      (where['appointment'] as Record<string, unknown>)['tenant_id'] = filters.tenantId;
    }
    if (filters.confirmationStatus) {
      (where['appointment'] as Record<string, unknown>)['tenant_confirmation_status'] = filters.confirmationStatus;
    }
    if (filters.search) {
      where['tenant_name'] = { contains: filters.search, mode: 'insensitive' };
    }
    return where;
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
}
