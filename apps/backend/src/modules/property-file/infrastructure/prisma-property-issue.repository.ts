import { Prisma, type PrismaClient } from '@prisma/client';
import type { PropertyIssueSource } from '@properfy/shared';
import type {
  IPropertyIssueRepository,
  IPropertyIssueIndicatorReader,
} from '../domain/property-issue.repository';
import type {
  PropertyIssueEntity,
  NewPropertyIssue,
  AppointmentScope,
  InspectorFieldEventScope,
} from '../domain/property-issue.entity';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface PropertyIssueRow {
  id: string;
  tenant_id: string;
  property_id: string;
  appointment_id: string | null;
  reason: string;
  source: string;
  created_by_user_id: string | null;
  cant_do_event_id: string | null;
  seen_at: Date | null;
  seen_by_user_id: string | null;
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function toEntity(row: PropertyIssueRow): PropertyIssueEntity {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    appointmentId: row.appointment_id,
    reason: row.reason,
    source: row.source as PropertyIssueSource,
    createdByUserId: row.created_by_user_id,
    cantDoEventId: row.cant_do_event_id,
    seenAt: row.seen_at,
    seenByUserId: row.seen_by_user_id,
    deletedAt: row.deleted_at,
    deletedByUserId: row.deleted_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PrismaPropertyIssueRepository
  implements IPropertyIssueRepository, IPropertyIssueIndicatorReader
{
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async create(input: NewPropertyIssue, tx?: Prisma.TransactionClient): Promise<PropertyIssueEntity> {
    const row = (await this.db(tx).propertyIssue.create({
      data: {
        id: input.id,
        tenant_id: input.tenantId,
        property_id: input.propertyId,
        appointment_id: input.appointmentId,
        reason: input.reason,
        source: input.source,
        created_by_user_id: input.createdByUserId,
        cant_do_event_id: input.cantDoEventId,
        created_at: input.createdAt,
      },
    })) as PropertyIssueRow;
    return toEntity(row);
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<PropertyIssueEntity | null> {
    const row = (await this.db(tx).propertyIssue.findUnique({ where: { id } })) as PropertyIssueRow | null;
    return row ? toEntity(row) : null;
  }

  async listByProperty(
    propertyId: string,
    tenantId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyIssueEntity[]> {
    const rows = (await this.db(tx).propertyIssue.findMany({
      where: { property_id: propertyId, deleted_at: null, ...(tenantId ? { tenant_id: tenantId } : {}) },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    })) as PropertyIssueRow[];
    return rows.map(toEntity);
  }

  async listByAppointment(
    appointmentId: string,
    tenantId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PropertyIssueEntity[]> {
    const rows = (await this.db(tx).propertyIssue.findMany({
      where: {
        appointment_id: appointmentId,
        deleted_at: null,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    })) as PropertyIssueRow[];
    return rows.map(toEntity);
  }

  async markSeenCas(id: string, userId: string, now: Date): Promise<number> {
    const result = await this.prisma.propertyIssue.updateMany({
      where: { id, seen_at: null, deleted_at: null },
      data: { seen_at: now, seen_by_user_id: userId, updated_at: now },
    });
    return result.count;
  }

  async softDelete(
    id: string,
    deletedByUserId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).propertyIssue.update({
      where: { id },
      data: { deleted_at: now, deleted_by_user_id: deletedByUserId, updated_at: now },
    });
  }

  async findAppointmentScope(
    appointmentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AppointmentScope | null> {
    const row = await this.db(tx).appointment.findUnique({
      where: { id: appointmentId },
      select: { property_id: true, tenant_id: true },
    });
    if (!row) return null;
    return { propertyId: row.property_id, tenantId: row.tenant_id };
  }

  async findInspectorFieldEventScope(
    eventId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InspectorFieldEventScope | null> {
    const row = await this.db(tx).inspectorFieldEvent.findUnique({
      where: { id: eventId },
      select: { appointment_id: true, inspector_id: true, tenant_id: true, type: true },
    });
    if (!row) return null;
    return {
      appointmentId: row.appointment_id,
      inspectorId: row.inspector_id,
      tenantId: row.tenant_id,
      type: row.type,
    };
  }

  // ── Indicator reader (D26) ────────────────────────────────────────────────

  async findAppointmentsWithUnseenIssues(
    appointmentIds: string[],
    tenantId: string | undefined,
  ): Promise<Set<string>> {
    if (appointmentIds.length === 0) return new Set();
    const rows = await this.prisma.propertyIssue.findMany({
      where: {
        appointment_id: { in: appointmentIds },
        seen_at: null,
        deleted_at: null,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { appointment_id: true },
      distinct: ['appointment_id'],
    });
    return new Set(rows.map((r) => r.appointment_id).filter((v): v is string => v !== null));
  }

  async findPropertiesWithUnseenIssues(
    propertyIds: string[],
    tenantId: string | undefined,
  ): Promise<Set<string>> {
    if (propertyIds.length === 0) return new Set();
    const rows = await this.prisma.propertyIssue.findMany({
      where: {
        property_id: { in: propertyIds },
        seen_at: null,
        deleted_at: null,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      select: { property_id: true },
      distinct: ['property_id'],
    });
    return new Set(rows.map((r) => r.property_id));
  }

  async countAppointmentsWithUnseenIssues(tenantId: string | undefined): Promise<number> {
    const tenantFilter = tenantId ? Prisma.sql`AND tenant_id = ${tenantId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT appointment_id)::int AS count
        FROM property_issues
       WHERE appointment_id IS NOT NULL
         AND seen_at IS NULL
         AND deleted_at IS NULL
         ${tenantFilter}`;
    return Number(rows[0]?.count ?? 0);
  }

  async countPropertiesWithUnseenIssuesWithoutAppointment(
    tenantId: string | undefined,
  ): Promise<number> {
    const tenantFilter = tenantId ? Prisma.sql`AND tenant_id = ${tenantId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT property_id)::int AS count
        FROM property_issues
       WHERE appointment_id IS NULL
         AND seen_at IS NULL
         AND deleted_at IS NULL
         ${tenantFilter}`;
    return Number(rows[0]?.count ?? 0);
  }
}
