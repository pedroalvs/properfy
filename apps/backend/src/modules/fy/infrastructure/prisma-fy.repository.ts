import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  FyAgency,
  FyContactMatch,
  FyGroupAcceptanceRow,
  IFyRepository,
} from '../domain/fy.repository';

interface PhoneMatchRow {
  id: string;
  appointment_number: number;
  appointment_code_prefix: string | null;
  status: string;
  scheduled_date: Date;
  time_slot_start: string;
  time_slot_end: string;
  service_type_id: string;
  service_type_name: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  tenant_id: string;
  tenant_name: string;
  snapshot_name: string;
  snapshot_email: string | null;
  snapshot_phone: string | null;
}

export class PrismaFyRepository implements IFyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAppointmentsByContactPhone(params: {
    phoneDigitVariants: string[];
    statuses: string[];
    doneWithinHours: number;
  }): Promise<FyContactMatch | null> {
    // Snapshot/registry phones are stored as provided (not guaranteed E.164),
    // so both sides are compared digits-only against the AU variants.
    const rows = await this.prisma.$queryRaw<PhoneMatchRow[]>(Prisma.sql`
      SELECT
        a.id,
        a.appointment_number,
        t.appointment_code_prefix,
        a.status::text AS status,
        a.scheduled_date,
        a.time_slot_start,
        a.time_slot_end,
        a.service_type_id,
        st.name AS service_type_name,
        p.street, p.suburb, p.state, p.postcode,
        a.tenant_id,
        t.name AS tenant_name,
        ac.snapshot_name,
        COALESCE(ac.snapshot_email, c.primary_email) AS snapshot_email,
        COALESCE(ac.snapshot_phone, c.primary_phone) AS snapshot_phone
      FROM appointment_contacts ac
      JOIN appointments a ON a.id = ac.appointment_id
      JOIN tenants t ON t.id = a.tenant_id AND t.deleted_at IS NULL
      JOIN service_types st ON st.id = a.service_type_id
      JOIN properties p ON p.id = a.property_id
      LEFT JOIN contacts c ON c.id = ac.contact_id
      WHERE a.deleted_at IS NULL
      AND (
        regexp_replace(COALESCE(ac.snapshot_phone, ''), '[^0-9]', '', 'g') IN (${Prisma.join(params.phoneDigitVariants)})
        OR regexp_replace(COALESCE(c.primary_phone, ''), '[^0-9]', '', 'g') IN (${Prisma.join(params.phoneDigitVariants)})
      )
      AND (
        a.status::text IN (${Prisma.join(params.statuses)})
        OR (
          ${params.doneWithinHours}::int > 0
          AND a.status = 'DONE'
          AND a.updated_at > NOW() - make_interval(hours => ${params.doneWithinHours}::int)
        )
      )
      ORDER BY a.scheduled_date ASC
    `);

    if (rows.length === 0) return null;

    const first = rows[0]!;
    return {
      contact: {
        name: first.snapshot_name,
        email: first.snapshot_email,
        phone: first.snapshot_phone,
      },
      appointments: rows.map((row) => ({
        id: row.id,
        appointmentNumber: row.appointment_number,
        appointmentCodePrefix: row.appointment_code_prefix,
        status: row.status,
        scheduledDate: row.scheduled_date,
        timeSlotStart: row.time_slot_start,
        timeSlotEnd: row.time_slot_end,
        serviceTypeId: row.service_type_id,
        serviceTypeName: row.service_type_name,
        propertyAddress: `${row.street}, ${row.suburb} ${row.state} ${row.postcode}`,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
      })),
    };
  }

  async findAgencyById(id: string): Promise<FyAgency | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        name: true,
        timezone: true,
        branches: {
          where: { deleted_at: null, status: 'ACTIVE' },
          select: { id: true, name: true, contact_email: true, address_json: true },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!tenant) return null;

    return {
      id: tenant.id,
      name: tenant.name,
      timezone: tenant.timezone,
      branches: tenant.branches.map((b) => ({
        id: b.id,
        name: b.name,
        email: b.contact_email,
        address: formatBranchAddress(b.address_json),
      })),
    };
  }

  async appendAppointmentNote(
    appointmentId: string,
    line: string,
  ): Promise<{ tenantId: string } | null> {
    // Single-statement concat avoids a read-modify-write race; RETURNING
    // surfaces the tenant for audit without a second query.
    const rows = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      UPDATE appointments
      SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ${line} ELSE notes || E'\n' || ${line} END,
          updated_at = NOW()
      WHERE id = ${appointmentId} AND deleted_at IS NULL
      RETURNING tenant_id
    `;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? { tenantId } : null;
  }

  async findGroupAcceptanceInfo(groupId: string): Promise<FyGroupAcceptanceRow[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { service_group_id: groupId, inspector_id: { not: null }, deleted_at: null },
      select: {
        id: true,
        appointment_number: true,
        inspector_id: true,
        inspector: { select: { name: true } },
        tenant: { select: { appointment_code_prefix: true } },
      },
    });
    return rows.map((row) => ({
      appointmentId: row.id,
      appointmentNumber: row.appointment_number,
      appointmentCodePrefix: row.tenant?.appointment_code_prefix ?? null,
      inspectorId: row.inspector_id!,
      inspectorName: row.inspector?.name ?? '',
    }));
  }
}

function formatBranchAddress(addressJson: unknown): string | null {
  if (!addressJson || typeof addressJson !== 'object') return null;
  const a = addressJson as Record<string, unknown>;
  const parts = [a['street'], a['suburb'], a['state'], a['postcode']]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}
