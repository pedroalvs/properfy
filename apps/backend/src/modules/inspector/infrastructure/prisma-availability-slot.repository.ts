import type { PrismaClient } from '@prisma/client';
import { AvailabilitySlotEntity } from '../domain/availability-slot.entity';
import type {
  IAvailabilitySlotRepository,
  AvailabilitySlotFilters,
  PaginationParams,
} from '../domain/availability-slot.repository';
import type { AvailabilitySlotStatus } from '@properfy/shared';

function mapToEntity(row: {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
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
  ): Promise<AvailabilitySlotEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.inspectorAvailabilitySlot.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [pagination.sortBy ?? 'created_at']: pagination.sortOrder,
      },
    });
    return rows.map(mapToEntity);
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
        region_json: slot.regionJson ?? undefined,
        capacity: slot.capacity,
        status: slot.status as string,
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
    await this.prisma.inspectorAvailabilitySlot.update({
      where: { id },
      data: updateData,
    });
  }

  private buildWhere(filters: AvailabilitySlotFilters) {
    const where: Record<string, unknown> = {
      inspector_id: filters.inspectorId,
    };
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
