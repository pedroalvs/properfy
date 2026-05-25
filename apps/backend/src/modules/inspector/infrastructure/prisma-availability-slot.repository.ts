import type { PrismaClient } from '@prisma/client';
import type { AvailabilitySlotStatus as PrismaAvailabilitySlotStatus, Prisma } from '@prisma/client';
import { AvailabilitySlotEntity } from '../domain/availability-slot.entity';
import type {
  IAvailabilitySlotRepository,
  AvailabilitySlotFilters,
  AvailabilitySlotWithInspector,
  PaginationParams,
} from '../domain/availability-slot.repository';
import type { AvailabilitySlotStatus } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  inspector_id: string;
  date: Date;
  start_time: string;
  end_time: string;
  region_json: unknown;
  capacity: number;
  status: string;
  is_operator_override?: boolean;
  created_at: Date;
  updated_at: Date;
}): AvailabilitySlotEntity {
  return new AvailabilitySlotEntity({
    id: row.id,
    inspectorId: row.inspector_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    regionJson: (row.region_json as Record<string, unknown>) ?? null,
    capacity: row.capacity,
    status: row.status as AvailabilitySlotStatus,
    isOperatorOverride: row.is_operator_override ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapToEntityWithInspector(row: {
  id: string;
  inspector_id: string;
  date: Date;
  start_time: string;
  end_time: string;
  region_json: unknown;
  capacity: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  inspector: { name: string } | null;
}): AvailabilitySlotWithInspector {
  const entity = mapToEntity(row);
  return Object.assign(entity, { inspectorName: row.inspector?.name ?? null });
}

export class PrismaAvailabilitySlotRepository
  implements IAvailabilitySlotRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findById(
    id: string,
    inspectorId: string,
  ): Promise<AvailabilitySlotEntity | null> {
    const row = await this.prisma.inspectorAvailabilitySlot.findFirst({
      where: { id, inspector_id: inspectorId },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByIdAny(id: string): Promise<AvailabilitySlotEntity | null> {
    const row = await this.prisma.inspectorAvailabilitySlot.findFirst({
      where: { id },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByDateRange(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity[]> {
    const rows = await this.prisma.inspectorAvailabilitySlot.findMany({
      where: {
        inspector_id: inspectorId,
        date,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
        status: { not: 'CANCELLED' },
      },
    });
    return rows.map(mapToEntity);
  }

  async findAll(
    filters: AvailabilitySlotFilters,
    pagination: PaginationParams,
  ): Promise<AvailabilitySlotWithInspector[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.inspectorAvailabilitySlot.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
      include: {
        inspector: { select: { name: true } },
      },
    });
    return rows.map(mapToEntityWithInspector);
  }

  async count(filters: AvailabilitySlotFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.inspectorAvailabilitySlot.count({ where });
  }

  async save(slot: AvailabilitySlotEntity): Promise<void> {
    await this.prisma.inspectorAvailabilitySlot.create({
      data: {
        id: slot.id,
        inspector_id: slot.inspectorId,
        date: slot.date,
        start_time: slot.startTime,
        end_time: slot.endTime,
        region_json: (slot.regionJson as Prisma.InputJsonValue) ?? undefined,
        capacity: slot.capacity,
        status: slot.status as PrismaAvailabilitySlotStatus,
      },
    });
  }

  async update(
    id: string,
    inspectorId: string,
    data: Partial<{
      date: Date;
      startTime: string;
      endTime: string;
      regionJson: Record<string, unknown> | null;
      capacity: number;
      status: string;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.date !== undefined) updateData['date'] = data.date;
    if (data.startTime !== undefined)
      updateData['start_time'] = data.startTime;
    if (data.endTime !== undefined) updateData['end_time'] = data.endTime;
    if (data.regionJson !== undefined)
      updateData['region_json'] = data.regionJson;
    if (data.capacity !== undefined) updateData['capacity'] = data.capacity;
    if (data.status !== undefined) updateData['status'] = data.status;
    await this.prisma.inspectorAvailabilitySlot.updateMany({
      where: { id, inspector_id: inspectorId },
      data: updateData,
    });
  }

  async findMatchingSlot(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity | null> {
    const row = await this.prisma.inspectorAvailabilitySlot.findFirst({
      where: {
        inspector_id: inspectorId,
        date,
        status: 'AVAILABLE',
        start_time: { lte: startTime },
        end_time: { gte: endTime },
        capacity: { gt: 0 },
      },
      orderBy: { start_time: 'asc' },
    });
    return row ? mapToEntity(row) : null;
  }

  async decrementCapacity(slotId: string): Promise<number | null> {
    const result = await this.prisma.inspectorAvailabilitySlot.updateMany({
      where: { id: slotId, capacity: { gt: 0 } },
      data: { capacity: { decrement: 1 } },
    });
    if (result.count === 0) return null;
    const updated = await this.prisma.inspectorAvailabilitySlot.findUnique({
      where: { id: slotId },
      select: { capacity: true },
    });
    return updated?.capacity ?? null;
  }

  async incrementCapacity(slotId: string): Promise<void> {
    await this.prisma.inspectorAvailabilitySlot.update({
      where: { id: slotId },
      data: { capacity: { increment: 1 } },
    });
  }

  async findSlotForRestore(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity | null> {
    const row = await this.prisma.inspectorAvailabilitySlot.findFirst({
      where: {
        inspector_id: inspectorId,
        date,
        status: { not: 'CANCELLED' },
        start_time: { lte: startTime },
        end_time: { gte: endTime },
      },
      orderBy: { start_time: 'asc' },
    });
    return row ? mapToEntity(row) : null;
  }

  async findSlotsForRegeneration(
    inspectorId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ id: string; date: Date; startTime: string; endTime: string; capacity: number; isOperatorOverride: boolean }>> {
    const rows = await (this.prisma.inspectorAvailabilitySlot as any).findMany({
      where: {
        inspector_id: inspectorId,
        date: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        date: true,
        start_time: true,
        end_time: true,
        capacity: true,
        is_operator_override: true,
      },
    });
    return rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      capacity: r.capacity,
      isOperatorOverride: r.is_operator_override ?? false,
    }));
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.inspectorAvailabilitySlot.delete({ where: { id } });
  }

  async saveForRegeneration(data: {
    inspectorId: string;
    date: Date;
    startTime: string;
    endTime: string;
    capacity: number;
    status: string;
    isOperatorOverride: false;
  }): Promise<void> {
    await (this.prisma.inspectorAvailabilitySlot as any).create({
      data: {
        id: crypto.randomUUID(),
        inspector_id: data.inspectorId,
        date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        capacity: data.capacity,
        status: data.status,
        is_operator_override: false,
      },
    });
  }

  private buildWhere(filters: AvailabilitySlotFilters) {
    const where: Record<string, unknown> = {};
    if (filters.inspectorId) where['inspector_id'] = filters.inspectorId;
    if (filters.status) where['status'] = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (filters.dateFrom) dateFilter['gte'] = new Date(filters.dateFrom);
      if (filters.dateTo) dateFilter['lte'] = new Date(filters.dateTo);
      where['date'] = dateFilter;
    }
    return where;
  }
}
