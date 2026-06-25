import type { InspectorAvailabilityResponse } from '@properfy/shared';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { buildAvailabilityComposite } from './build-availability-composite';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface GetAvailabilityTemplateInput {
  inspectorId: string;
}

/**
 * Returns the inspector's weekly availability template plus the override map
 * derived from operator-created slots in the next 8 weeks.
 */
export class GetInspectorAvailabilityTemplateUseCase {
  constructor(
    private readonly inspectorRepo: Pick<IInspectorRepository, 'findById' | 'getAvailabilityTemplate'>,
    private readonly slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration'>,
  ) {}

  async execute(input: GetAvailabilityTemplateInput): Promise<InspectorAvailabilityResponse> {
    const inspector = await this.inspectorRepo.findById(input.inspectorId);
    if (!inspector) throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');

    return buildAvailabilityComposite(input.inspectorId, this.inspectorRepo, this.slotRepo);
  }
}
