import type { InspectorAvailabilityResponse } from '@properfy/shared';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { buildAvailabilityComposite } from './build-availability-composite';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface GetInspectorAvailabilityTemplateForOperatorInput {
  inspectorId: string;
}

/**
 * Operator/admin variant of the availability template query.
 * RBAC enforcement is at the route layer (AM + OP only).
 */
export class GetInspectorAvailabilityTemplateForOperatorUseCase {
  constructor(
    private readonly inspectorRepo: Pick<IInspectorRepository, 'findById' | 'getAvailabilityTemplate'>,
    private readonly slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration'>,
  ) {}

  async execute(
    input: GetInspectorAvailabilityTemplateForOperatorInput,
  ): Promise<InspectorAvailabilityResponse> {
    const inspector = await this.inspectorRepo.findById(input.inspectorId);
    if (!inspector) throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    return buildAvailabilityComposite(input.inspectorId, this.inspectorRepo, this.slotRepo);
  }
}
