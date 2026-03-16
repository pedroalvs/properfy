import type { AvailabilitySlotEntity } from './availability-slot.entity';

export interface AvailabilitySlotFilters {
  inspectorId: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export interface IAvailabilitySlotRepository {
  findById(
    id: string,
    inspectorId: string,
  ): Promise<AvailabilitySlotEntity | null>;
  findByDateRange(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity[]>;
  findAll(
    filters: AvailabilitySlotFilters,
    pagination: PaginationParams,
  ): Promise<AvailabilitySlotEntity[]>;
  count(filters: AvailabilitySlotFilters): Promise<number>;
  save(slot: AvailabilitySlotEntity): Promise<void>;
  update(
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
  ): Promise<void>;
}
