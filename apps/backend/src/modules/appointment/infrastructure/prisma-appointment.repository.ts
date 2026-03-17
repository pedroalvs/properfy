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
  PaginationParams,
  AppointmentWithRelations,
} from '../domain/appointment.repository';
import type {
  AppointmentStatus,
  TenantConfirmationStatus,
  RestrictionSource,
} from '@properfy/shared';

function mapToEntity(row: any): AppointmentEntity {
  return new AppointmentEntity({
    id: row.id,
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
      },
    });

    if (!row) return null;

    const appointment = mapToEntity(row);
    const contact = row.contact ? mapContactToEntity(row.contact) : null;
    const restrictions = row.restrictions.map(mapRestrictionToEntity);

    return { appointment, contact, restrictions };
  }

  async findAll(
    filters: AppointmentFilters,
    pagination: PaginationParams,
  ): Promise<AppointmentEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.appointment.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
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
    const where: Record<string, unknown> = {
      tenant_id: filters.tenantId,
      deleted_at: null,
    };
    if (filters.status) where['status'] = filters.status;
    if (filters.serviceTypeId) where['service_type_id'] = filters.serviceTypeId;
    if (filters.branchId) where['branch_id'] = filters.branchId;
    if (filters.inspectorId) where['inspector_id'] = filters.inspectorId;
    if (filters.tenantConfirmationStatus) {
      where['tenant_confirmation_status'] = filters.tenantConfirmationStatus;
    }
    if (filters.search) {
      where['notes'] = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.fromDate || filters.toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (filters.fromDate) dateFilter['gte'] = new Date(filters.fromDate);
      if (filters.toDate) dateFilter['lte'] = new Date(filters.toDate);
      where['scheduled_date'] = dateFilter;
    }
    return where;
  }
}
