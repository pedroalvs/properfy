import type { AvailabilityTemplate, InspectorAvailabilityResponse } from '@properfy/shared';
import { availabilityTemplateSchema } from '@properfy/shared';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { RegenerateInspectorAvailabilitySlotsUseCase } from './regenerate-inspector-availability-slots.use-case';
import { deriveOverrideMap } from './availability-override-map';
import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface UpdateAvailabilityTemplateInput {
  inspectorId: string;
  template: unknown;
  actorId: string;
}

/**
 * Persists a new weekly availability template, regenerates the next 8 weeks of
 * per-date slots applying the 6 merge rules, then returns the composite response
 * (template + override map). Emits an audit event.
 */
export class UpdateInspectorAvailabilityTemplateUseCase {
  private readonly regenerator: RegenerateInspectorAvailabilitySlotsUseCase;

  constructor(
    private readonly inspectorRepo: Pick<IInspectorRepository, 'findById' | 'getAvailabilityTemplate' | 'updateAvailabilityTemplate'>,
    private readonly slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration' | 'deleteById' | 'saveForRegeneration'>,
    private readonly auditService: AuditService,
  ) {
    this.regenerator = new RegenerateInspectorAvailabilitySlotsUseCase(slotRepo);
  }

  async execute(input: UpdateAvailabilityTemplateInput): Promise<InspectorAvailabilityResponse> {
    const parsed = availabilityTemplateSchema.safeParse(input.template);
    if (!parsed.success) {
      throw new ValidationError(`Invalid availability template: ${parsed.error.message}`);
    }
    const newTemplate: AvailabilityTemplate = parsed.data;

    const inspector = await this.inspectorRepo.findById(input.inspectorId);
    if (!inspector) throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');

    const previousTemplate = await this.inspectorRepo.getAvailabilityTemplate(input.inspectorId);

    await this.inspectorRepo.updateAvailabilityTemplate(input.inspectorId, newTemplate);

    const { slotsCreated, slotsDeleted, slotsPreserved } = await this.regenerator.execute({
      inspectorId: input.inspectorId,
      template: newTemplate,
    });

    const overrides = await deriveOverrideMap(input.inspectorId, this.slotRepo);

    this.auditService.log({
      action: 'inspector.availability_template_updated',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'Inspector',
      entityId: input.inspectorId,
      before: { template: previousTemplate },
      after: {
        template: newTemplate,
        slotsCreated,
        slotsDeleted,
        slotsPreserved,
        inspectorId: input.inspectorId,
      },
    });

    return { template: newTemplate, overrides };
  }
}
