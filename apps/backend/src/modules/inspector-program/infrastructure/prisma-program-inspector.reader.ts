import type { Prisma, PrismaClient } from '@prisma/client';
import type { ParticipantInspector } from '../domain/participants';
import type { IProgramInspectorReader } from '../domain/program-inspector.reader';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Extract the service-type ids from an inspector's `service_types_json`. */
function serviceTypeIdsFromJson(json: Prisma.JsonValue): string[] {
  if (!Array.isArray(json)) return [];
  const ids: string[] = [];
  for (const entry of json) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const value = (entry as Record<string, unknown>).serviceTypeId;
      if (typeof value === 'string') ids.push(value);
    }
  }
  return ids;
}

export class PrismaProgramInspectorReader implements IProgramInspectorReader {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async loadActiveInspectors(tx?: Prisma.TransactionClient): Promise<ParticipantInspector[]> {
    const rows = await this.db(tx).inspector.findMany({
      where: { status: 'ACTIVE', deleted_at: null },
      select: { id: true, status: true, deleted_at: true, service_types_json: true },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      deletedAt: row.deleted_at,
      serviceTypeIds: serviceTypeIdsFromJson(row.service_types_json),
    }));
  }

  async loadRegionInspectorIds(
    regionIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (regionIds.length === 0) return map;
    const rows = await this.db(tx).inspectorRegion.findMany({
      where: { region_id: { in: regionIds } },
      select: { region_id: true, inspector_id: true },
    });
    for (const row of rows) {
      const set = map.get(row.region_id) ?? new Set<string>();
      set.add(row.inspector_id);
      map.set(row.region_id, set);
    }
    return map;
  }
}
