import { Prisma, type PrismaClient } from '@prisma/client';
import type { ContactType } from '@properfy/shared';
import { ContactEntity } from '../domain/contact.entity';
import type {
  IContactRepository,
  ContactFilters,
  ContactPagination,
  ContactAppointmentSummary,
  ContactPropertyAggregate,
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
      const typeClause = type
        ? Prisma.sql`AND type = ${type}::"ContactType"`
        : Prisma.sql``;
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
          ${typeClause}
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

  async findActiveByEmailOrPhone(
    tenantId: string,
    email: string | null,
    phone: string | null,
  ): Promise<ContactEntity | null> {
    if (!email && !phone) return null;
    const or: Array<Record<string, unknown>> = [];
    if (email) or.push({ primary_email: email });
    if (phone) or.push({ primary_phone: phone });
    const row = await this.prisma.contact.findFirst({
      where: {
        tenant_id: tenantId,
        is_active: true,
        OR: or,
      } as any,
    });
    return row ? mapToEntity(row) : null;
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
            property_id: true,
            property: {
              select: { property_code: true },
            },
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
      isPrimary: row.is_primary,
      propertyId: row.appointment.property_id,
      propertyCode: row.appointment.property.property_code,
    }));
  }

  async countAppointmentsByContactId(contactId: string): Promise<number> {
    return this.prisma.appointmentContact.count({
      where: { contact_id: contactId },
    });
  }

  async countDistinctPropertiesByContactIds(
    contactIds: string[],
  ): Promise<Map<string, number>> {
    if (contactIds.length === 0) return new Map();

    // BUG-001 (REV 4): the deployed schema stores `id` as Postgres `text`
    // (Prisma `String` without `@db.Uuid`), so casting the bound array to
    // `::uuid[]` raises an `invalid input syntax for type uuid` error against
    // staging Supabase. Cast to `::text[]` to match the column type.
    const rows = await this.prisma.$queryRaw<Array<{ contact_id: string; property_count: number }>>`
      SELECT ac.contact_id, count(DISTINCT a.property_id)::int AS property_count
      FROM appointment_contacts ac
      JOIN appointments a ON a.id = ac.appointment_id
      WHERE ac.contact_id = ANY(${contactIds}::text[])
      GROUP BY ac.contact_id
    `;

    const map = new Map<string, number>();
    for (const id of contactIds) map.set(id, 0);
    for (const row of rows) map.set(row.contact_id, row.property_count);
    return map;
  }

  async countPrimaryDistinctPropertiesByContactIds(
    contactIds: string[],
  ): Promise<Map<string, number>> {
    if (contactIds.length === 0) return new Map();

    // 023 §FR-202: count distinct properties on which each contact is the
    // primary recipient across non-CANCELLED/REJECTED appointments. The
    // BUG-001 source-scan unit guard rejects `::uuid` casts in the three
    // 022-era methods, so this new method also uses `::text[]`.
    const rows = await this.prisma.$queryRaw<Array<{ contact_id: string; property_count: number }>>`
      SELECT
        ac.contact_id,
        count(DISTINCT a.property_id) FILTER (
          WHERE ac.is_primary = true AND a.status NOT IN ('CANCELLED', 'REJECTED')
        )::int AS property_count
      FROM appointment_contacts ac
      JOIN appointments a ON a.id = ac.appointment_id
      WHERE ac.contact_id = ANY(${contactIds}::text[])
      GROUP BY ac.contact_id
    `;

    const map = new Map<string, number>();
    for (const id of contactIds) map.set(id, 0);
    for (const row of rows) map.set(row.contact_id, row.property_count);
    return map;
  }

  async findPropertiesByContactId(
    contactId: string,
    pagination: ContactPagination,
  ): Promise<ContactPropertyAggregate[]> {
    const limit = pagination.pageSize;
    const offset = (pagination.page - 1) * pagination.pageSize;

    const rows = await this.prisma.$queryRaw<Array<{
      property_id: string;
      property_code: string;
      street: string;
      suburb: string;
      postcode: string;
      state: string;
      appointment_count: number;
      is_primary_in_active_appointment: boolean;
    }>>`
      SELECT
        p.id AS property_id,
        p.property_code,
        p.street,
        p.suburb,
        p.postcode,
        p.state,
        count(*)::int AS appointment_count,
        bool_or(ac.is_primary AND a.status NOT IN ('CANCELLED', 'REJECTED')) AS is_primary_in_active_appointment
      FROM appointment_contacts ac
      JOIN appointments a ON a.id = ac.appointment_id
      JOIN properties p ON p.id = a.property_id
      WHERE ac.contact_id = ${contactId}::text
      GROUP BY p.id, p.property_code, p.street, p.suburb, p.postcode, p.state
      ORDER BY MAX(a.scheduled_date) DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;

    return rows.map((r) => ({
      propertyId: r.property_id,
      propertyCode: r.property_code,
      street: r.street,
      suburb: r.suburb,
      postcode: r.postcode,
      state: r.state,
      appointmentCount: r.appointment_count,
      isPrimaryInActiveAppointment: r.is_primary_in_active_appointment,
    }));
  }

  async countPropertiesByContactId(contactId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ property_count: number }>>`
      SELECT count(DISTINCT a.property_id)::int AS property_count
      FROM appointment_contacts ac
      JOIN appointments a ON a.id = ac.appointment_id
      WHERE ac.contact_id = ${contactId}::text
    `;
    return rows[0]?.property_count ?? 0;
  }

  private buildWhere(filters: ContactFilters): Record<string, unknown> {
    if (!filters.tenantId) {
      throw new Error('tenantId is required for contact queries — never query without tenant scope');
    }
    const where: Record<string, unknown> = {};
    where['tenant_id'] = filters.tenantId;
    // 023 §FR-204: `type` is now a multiselect (array). For backwards-compat
    // a single value is accepted (use case wraps it before calling).
    if (filters.type && filters.type.length > 0) {
      where['type'] = filters.type.length === 1 ? filters.type[0] : { in: filters.type };
    }
    if (filters.isActive !== undefined) where['is_active'] = filters.isActive;
    if (filters.search) {
      where['OR'] = [
        { display_name: { contains: filters.search, mode: 'insensitive' } },
        { primary_email: { contains: filters.search, mode: 'insensitive' } },
        { primary_phone: { contains: filters.search } },
      ];
    }

    // Each `appointment_contacts.some` clause emits an EXISTS subquery in the
    // generated SQL. AND-combining several of them keeps each filter
    // independently scoped (a contact can satisfy both "appears in branch X"
    // AND "is primary in some active appointment" without the conditions
    // requiring the SAME junction row).
    const relationFilters: Array<Record<string, unknown>> = [];

    // 023 §FR-204: branch filter — contact has at least one appointment
    // touching one of the requested branches (joined via property.branch_id).
    if (filters.branchIds && filters.branchIds.length > 0) {
      relationFilters.push({
        appointment_contacts: {
          some: {
            appointment: {
              property: { branch_id: { in: filters.branchIds } },
            },
          },
        },
      });
    }

    // 023 §FR-205: "primary" filter — contact is primary in at least one
    // non-CANCELLED/REJECTED appointment (matches `primaryInPropertyCount > 0`).
    if (filters.primary === true) {
      relationFilters.push({
        appointment_contacts: {
          some: {
            is_primary: true,
            appointment: { status: { notIn: ['CANCELLED', 'REJECTED'] } },
          },
        },
      });
    }

    if (relationFilters.length > 0) {
      where['AND'] = relationFilters;
    }
    return where;
  }
}
