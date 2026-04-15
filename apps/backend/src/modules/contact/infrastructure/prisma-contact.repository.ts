import type { PrismaClient } from '@prisma/client';
import type { ContactType } from '@properfy/shared';
import { ContactEntity } from '../domain/contact.entity';
import type {
  IContactRepository,
  ContactFilters,
  ContactPagination,
  ContactAppointmentSummary,
} from '../domain/contact.repository';

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  tenant_id: string;
  type: string;
  display_name: string;
  company: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  additional_channels_json: unknown;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): ContactEntity {
  return new ContactEntity({
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as ContactType,
    displayName: row.display_name,
    company: row.company,
    primaryEmail: row.primary_email,
    primaryPhone: row.primary_phone,
    additionalChannels: Array.isArray(row.additional_channels_json)
      ? (row.additional_channels_json as { channel: 'EMAIL' | 'PHONE'; value: string; label?: string }[])
      : [],
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PrismaContactRepository implements IContactRepository {
  private hasTrgm: boolean | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private async checkTrgm(): Promise<boolean> {
    if (this.hasTrgm !== null) return this.hasTrgm;
    try {
      const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint as count FROM pg_extension WHERE extname = 'pg_trgm'
      `;
      this.hasTrgm = result.length > 0 && result[0] != null && Number(result[0].count) > 0;
    } catch {
      this.hasTrgm = false;
    }
    return this.hasTrgm;
  }

  async findById(contactId: string, tenantId: string | null): Promise<ContactEntity | null> {
    const where: Record<string, unknown> = { id: contactId };
    if (tenantId) where['tenant_id'] = tenantId;

    const row = await this.prisma.contact.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async findAll(filters: ContactFilters, pagination: ContactPagination): Promise<ContactEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.contact.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'display_name')]: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: ContactFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.contact.count({ where });
  }

  async search(
    tenantId: string,
    query: string,
    type?: ContactType,
    isActive?: boolean,
  ): Promise<ContactEntity[]> {
    const hasTrgm = await this.checkTrgm();
    const activeFilter = isActive ?? true;

    if (hasTrgm) {
      const rows = await this.prisma.$queryRaw<Array<{
        id: string;
        tenant_id: string;
        type: string;
        display_name: string;
        company: string | null;
        primary_email: string | null;
        primary_phone: string | null;
        additional_channels_json: unknown;
        notes: string | null;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
        sim: number;
      }>>`
        SELECT *, greatest(
          similarity(display_name, ${query}),
          similarity(COALESCE(primary_email, ''), ${query}),
          similarity(COALESCE(primary_phone, ''), ${query})
        ) as sim
        FROM contacts
        WHERE tenant_id = ${tenantId}
          AND is_active = ${activeFilter}
          ${type ? this.prisma.$queryRaw`AND type = ${type}::"ContactType"` : this.prisma.$queryRaw``}
          AND (
            display_name % ${query}
            OR COALESCE(primary_email, '') % ${query}
            OR COALESCE(primary_phone, '') % ${query}
          )
        ORDER BY sim DESC
        LIMIT 20
      `;
      return rows.map(mapToEntity);
    }

    // Fallback: ILIKE prefix search
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      is_active: activeFilter,
      OR: [
        { display_name: { contains: query, mode: 'insensitive' } },
        { primary_email: { contains: query, mode: 'insensitive' } },
        { primary_phone: { contains: query } },
      ],
    };
    if (type) where['type'] = type;

    const rows = await this.prisma.contact.findMany({
      where: where as any,
      take: 20,
      orderBy: { display_name: 'asc' },
    });
    return rows.map(mapToEntity);
  }

  async save(contact: ContactEntity): Promise<void> {
    await this.prisma.contact.create({
      data: {
        id: contact.id,
        tenant_id: contact.tenantId,
        type: contact.type as any,
        display_name: contact.displayName,
        company: contact.company,
        primary_email: contact.primaryEmail,
        primary_phone: contact.primaryPhone,
        additional_channels_json: contact.additionalChannels as any,
        notes: contact.notes,
        is_active: contact.isActive,
      },
    });
  }

  async update(
    contactId: string,
    tenantId: string,
    data: Partial<{
      type: ContactType;
      displayName: string;
      company: string | null;
      primaryEmail: string | null;
      primaryPhone: string | null;
      additionalChannels: unknown;
      notes: string | null;
      isActive: boolean;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData['type'] = data.type;
    if (data.displayName !== undefined) updateData['display_name'] = data.displayName;
    if (data.company !== undefined) updateData['company'] = data.company;
    if (data.primaryEmail !== undefined) updateData['primary_email'] = data.primaryEmail;
    if (data.primaryPhone !== undefined) updateData['primary_phone'] = data.primaryPhone;
    if (data.additionalChannels !== undefined) updateData['additional_channels_json'] = data.additionalChannels;
    if (data.notes !== undefined) updateData['notes'] = data.notes;
    if (data.isActive !== undefined) updateData['is_active'] = data.isActive;

    await this.prisma.contact.updateMany({
      where: { id: contactId, tenant_id: tenantId },
      data: updateData,
    });
  }

  async existsByEmail(tenantId: string, email: string, excludeContactId?: string): Promise<boolean> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      primary_email: email,
      is_active: true,
    };
    if (excludeContactId) {
      where['NOT'] = { id: excludeContactId };
    }
    const count = await this.prisma.contact.count({ where: where as any });
    return count > 0;
  }

  async existsByPhone(tenantId: string, phone: string, excludeContactId?: string): Promise<boolean> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      primary_phone: phone,
      is_active: true,
    };
    if (excludeContactId) {
      where['NOT'] = { id: excludeContactId };
    }
    const count = await this.prisma.contact.count({ where: where as any });
    return count > 0;
  }

  async findAppointmentsByContactId(
    contactId: string,
    pagination: ContactPagination,
  ): Promise<ContactAppointmentSummary[]> {
    const rows = await this.prisma.appointmentContact.findMany({
      where: { contact_id: contactId },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { created_at: 'desc' },
      include: {
        appointment: {
          select: {
            id: true,
            appointment_number: true,
            status: true,
            scheduled_date: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      appointmentId: row.appointment.id,
      appointmentNumber: row.appointment.appointment_number,
      status: row.appointment.status,
      scheduledDate: row.appointment.scheduled_date,
      role: row.role,
    }));
  }

  async countAppointmentsByContactId(contactId: string): Promise<number> {
    return this.prisma.appointmentContact.count({
      where: { contact_id: contactId },
    });
  }

  private buildWhere(filters: ContactFilters): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where['tenant_id'] = filters.tenantId;
    if (filters.type) where['type'] = filters.type;
    if (filters.isActive !== undefined) where['is_active'] = filters.isActive;
    if (filters.search) {
      where['OR'] = [
        { display_name: { contains: filters.search, mode: 'insensitive' } },
        { primary_email: { contains: filters.search, mode: 'insensitive' } },
        { primary_phone: { contains: filters.search } },
      ];
    }
    return where;
  }
}
