import { type PrismaClient, type Prisma } from '@prisma/client';
import type { InspectorFieldEventType } from '@properfy/shared';
import type { IInspectorFieldEventRepository } from '../domain/inspector-field-event.repository';
import type {
  InspectorFieldEventEntity,
  LatestCantDo,
  FieldEventRecord,
} from '../domain/inspector-field-event.entity';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface LatestCantDoRow {
  appointment_id: string;
  reason_code: string;
  note: string | null;
  inspector_id: string;
  inspector_name: string | null;
  created_at: Date;
}

function toLatestCantDo(row: LatestCantDoRow): LatestCantDo {
  return {
    appointmentId: row.appointment_id,
    reasonCode: row.reason_code,
    note: row.note,
    inspectorId: row.inspector_id,
    inspectorName: row.inspector_name,
    occurredAt: row.created_at,
  };
}

export class PrismaInspectorFieldEventRepository implements IInspectorFieldEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async create(event: InspectorFieldEventEntity, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).inspectorFieldEvent.create({
      data: {
        id: event.id,
        appointment_id: event.appointmentId,
        inspector_id: event.inspectorId,
        tenant_id: event.tenantId,
        type: event.type,
        reason_code: event.reasonCode,
        note: event.note,
        minutes: event.minutes,
        latitude: event.latitude,
        longitude: event.longitude,
        accuracy_m: event.accuracyMeters,
        client_occurred_at: event.clientOccurredAt,
        created_at: event.createdAt,
      },
    });
  }

  // One DISTINCT ON query per page — the latest CANT_DO per appointment, joined to
  // the inspector name. Uses the (appointment_id, type, created_at desc) index.
  // Empty input → no query (avoid an `= ANY('{}')` round trip).
  async findLatestCantDoByAppointmentIds(appointmentIds: string[]): Promise<LatestCantDo[]> {
    if (appointmentIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<LatestCantDoRow[]>`
      SELECT DISTINCT ON (e.appointment_id)
             e.appointment_id, e.reason_code, e.note, e.inspector_id,
             i.name AS inspector_name, e.created_at
        FROM inspector_field_events e
        JOIN inspectors i ON i.id = e.inspector_id
       WHERE e.appointment_id = ANY(${appointmentIds}::text[])
         AND e.type = 'CANT_DO'
       ORDER BY e.appointment_id, e.created_at DESC
    `;
    return rows.map(toLatestCantDo);
  }

  async findLatestCantDoByAppointmentId(
    appointmentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LatestCantDo | null> {
    const row = await this.db(tx).inspectorFieldEvent.findFirst({
      where: { appointment_id: appointmentId, type: 'CANT_DO' },
      orderBy: { created_at: 'desc' },
      include: { inspector: { select: { name: true } } },
    });
    if (!row) return null;
    return {
      appointmentId: row.appointment_id,
      reasonCode: row.reason_code,
      note: row.note,
      inspectorId: row.inspector_id,
      inspectorName: row.inspector?.name ?? null,
      occurredAt: row.created_at,
    };
  }

  async listByAppointmentId(appointmentId: string, limit: number): Promise<FieldEventRecord[]> {
    const rows = await this.prisma.inspectorFieldEvent.findMany({
      where: { appointment_id: appointmentId },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { inspector: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type as InspectorFieldEventType,
      reasonCode: row.reason_code,
      note: row.note,
      minutes: row.minutes,
      inspectorName: row.inspector?.name ?? null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      accuracyMeters: row.accuracy_m != null ? Number(row.accuracy_m) : null,
      clientOccurredAt: row.client_occurred_at ?? null,
      occurredAt: row.created_at,
    }));
  }

  async lockAppointmentForFieldEvent(
    appointmentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId} FOR UPDATE`;
  }
}
