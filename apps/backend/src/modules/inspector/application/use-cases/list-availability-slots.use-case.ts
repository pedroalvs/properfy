import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IAvailabilitySlotRepository,
  AvailabilitySlotFilters,
  PaginationParams,
} from '../../domain/availability-slot.repository';

export interface ListAvailabilitySlotsInput {
  inspectorId?: string;
  filters: Omit<AvailabilitySlotFilters, 'inspectorId'>;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListAvailabilitySlotsOutput {
  data: Array<{
    id: string;
    inspectorId: string;
    inspectorName: string | null;
    date: Date;
    startTime: string;
    endTime: string;
    regionJson: Record<string, unknown> | null;
    capacity: number;
    status: string;
    isOperatorOverride: boolean;
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

    // The inspector filter that is actually applied to the query. For INSP it is
    // ALWAYS forced to the actor's own id — even when the request omits the param —
    // so the query can never fall back to an unscoped read over every inspector's
    // slots (#118). For AM/OP it stays optional (list all, or filter by one).
    let effectiveInspectorId = inspectorId;

    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      const resolvedInspectorId = inspectorId ?? actor.inspectorId;
      if (resolvedInspectorId !== actor.inspectorId) {
        throw new ForbiddenError('FORBIDDEN', "Cannot access another inspector's data");
      }
      effectiveInspectorId = actor.inspectorId;
    } else if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const fullFilters: AvailabilitySlotFilters = {
      ...filters,
      ...(effectiveInspectorId !== undefined ? { inspectorId: effectiveInspectorId } : {}),
    };

    const [data, total] = await Promise.all([
      this.slotRepo.findAll(fullFilters, pagination),
      this.slotRepo.count(fullFilters),
    ]);

    return {
      data: data.map((s) => ({
        id: s.id,
        inspectorId: s.inspectorId,
        inspectorName: s.inspectorName,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        regionJson: s.regionJson,
        capacity: s.capacity,
        status: s.status,
        isOperatorOverride: s.isOperatorOverride,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
