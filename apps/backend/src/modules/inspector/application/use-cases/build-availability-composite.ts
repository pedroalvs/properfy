import type { InspectorAvailabilityResponse } from '@properfy/shared';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IAvailabilitySlotRepository } from '../../domain/availability-slot.repository';
import { deriveOverrideMap } from './availability-override-map';

/**
 * Builds the inspector availability composite (template + overrides) for a
 * given inspector. Assumes the caller has already validated the inspector exists.
 */
export async function buildAvailabilityComposite(
  inspectorId: string,
  inspectorRepo: Pick<IInspectorRepository, 'getAvailabilityTemplate'>,
  slotRepo: Pick<IAvailabilitySlotRepository, 'findSlotsForRegeneration'>,
): Promise<InspectorAvailabilityResponse> {
  const template = await inspectorRepo.getAvailabilityTemplate(inspectorId);
  const overrides = await deriveOverrideMap(inspectorId, slotRepo);
  return { template, overrides };
}
