import type { AvailabilitySlotEntity } from './availability-slot.entity';

export interface AvailabilitySlotFilters {
  inspectorId?: string;
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

export interface AvailabilitySlotWithInspector extends AvailabilitySlotEntity {
  inspectorName: string | null;
}

export interface IAvailabilitySlotRepository {
  findById(
    id: string,
    inspectorId: string,
  ): Promise<AvailabilitySlotEntity | null>;
  findByIdAny(id: string): Promise<AvailabilitySlotEntity | null>;
  findByDateRange(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity[]>;
  findAll(
    filters: AvailabilitySlotFilters,
    pagination: PaginationParams,
  ): Promise<AvailabilitySlotWithInspector[]>;
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
  /** Find an AVAILABLE slot for the given inspector on a specific date whose time range overlaps the requested window. */
  findMatchingSlot(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity | null>;
  /** Atomically decrement capacity by 1. Returns the updated capacity, or null if no row was updated (capacity was already 0). */
  decrementCapacity(slotId: string): Promise<number | null>;
  /** Atomically increment capacity by 1 (restore after cancellation). */
  incrementCapacity(slotId: string): Promise<void>;
  /** Find any slot (regardless of capacity) for the given inspector on a specific date whose time range covers the requested window. Used for restoration. */
  findSlotForRestore(
    inspectorId: string,
    date: Date,
    startTime: string,
    endTime: string,
  ): Promise<AvailabilitySlotEntity | null>;
  /** Fetch all slots for an inspector in a date range for regeneration (includes capacity + isOperatorOverride). */
  findSlotsForRegeneration(
    inspectorId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{
    id: string;
    date: Date;
    startTime: string;
    endTime: string;
    capacity: number;
    isOperatorOverride: boolean;
  }>>;
  /** Hard-delete a slot by ID (used by regenerator when template turns OFF). */
  deleteById(id: string): Promise<void>;
  /** Create a new slot as part of regeneration (always is_operator_override = false). */
  saveForRegeneration(data: {
    inspectorId: string;
    date: Date;
    startTime: string;
    endTime: string;
    capacity: number;
    status: string;
    isOperatorOverride: false;
  }): Promise<void>;
}
