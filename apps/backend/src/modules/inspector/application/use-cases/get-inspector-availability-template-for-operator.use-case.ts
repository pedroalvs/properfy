import type { AuthContext, InspectorAvailabilityResponse } from '@properfy/shared';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { buildAvailabilityComposite } from './build-availability-composite';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface GetInspectorAvailabilityTemplateForOperatorInput {
  inspectorId: string;
  actor: AuthContext;
}

/** Operator/admin variant of the availability template query. */
export class GetInspectorAvailabilityTemplateForOperatorUseCase {
  constructor(
    private readonly inspectorRepo: Pick<IInspectorRepository, 'findById' | 'getAvailabilityTemplate'>,
    private readonly slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration'>,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(
    input: GetInspectorAvailabilityTemplateForOperatorInput,
  ): Promise<InspectorAvailabilityResponse> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'inspector.availabilityTemplate.read',
      entityType: 'Inspector',
    });

    const inspector = await this.inspectorRepo.findById(input.inspectorId);
    if (!inspector) throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    return buildAvailabilityComposite(input.inspectorId, this.inspectorRepo, this.slotRepo);
  }
}
