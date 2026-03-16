import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IAvailabilitySlotRepository,
  AvailabilitySlotFilters,
  PaginationParams,
} from '../../domain/availability-slot.repository';

export interface ListAvailabilitySlotsInput {
  inspectorId: string;
  filters: Omit<AvailabilitySlotFilters, 'inspectorId'>;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListAvailabilitySlotsOutput {
  data: Array<{
    id: string;
    inspectorId: string;
    date: Date;
    startTime: string;
    endTime: string;
    regionJson: Record<string, unknown> | null;
    capacity: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListAvailabilitySlotsUseCase {
  constructor(private readonly slotRepo: IAvailabilitySlotRepository) {}

  async execute(input: ListAvailabilitySlotsInput): Promise<ListAvailabilitySlotsOutput> {
    const { inspectorId, filters, pagination, actor } = input;

    // TODO: INSP role should be allowed to list own slots once User-Inspector link is established
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const fullFilters: AvailabilitySlotFilters = {
      inspectorId,
      ...filters,
    };

    const [data, total] = await Promise.all([
      this.slotRepo.findAll(fullFilters, pagination),
      this.slotRepo.count(fullFilters),
    ]);

    return {
      data: data.map((s) => ({
        id: s.id,
        inspectorId: s.inspectorId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        regionJson: s.regionJson,
        capacity: s.capacity,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
