import type { InspectorEntity } from '../../inspector/domain/inspector.entity';
import type { IServiceRegionRepository } from '../../service-region/domain/service-region.repository';
import {
  InspectorInactiveError,
  InspectorIneligibleError,
  InspectorServiceTypeIneligibleError,
} from '../domain/service-group.errors';

export interface AssertInspectorEligibleForGroupParams {
  inspector: InspectorEntity;
  /** The group's service type — the inspector must be qualified for it. */
  serviceTypeId: string;
  /** Distinct agencies of the group's members; the inspector must serve every one. */
  tenantIds: string[];
  /** Properties of the group's members; the inspector's regions must cover all of them. */
  propertyIds: string[];
  serviceRegionRepo: IServiceRegionRepository;
}

/**
 * The eligibility gate every inspector-assignment path shares.
 *
 * Extracted from `AssignInspectorManuallyUseCase` so manual assignment and
 * reassignment cannot drift apart: an inspector who may not take a group must
 * equally not be swapped into one. The check order is load-bearing — it decides
 * which error the operator sees when more than one reason applies.
 */
export async function assertInspectorEligibleForGroup(
  params: AssertInspectorEligibleForGroupParams,
): Promise<void> {
  const { inspector, serviceTypeId, tenantIds, propertyIds, serviceRegionRepo } = params;

  if (!inspector.isActive()) {
    throw new InspectorInactiveError();
  }

  if (!inspector.supportsServiceType(serviceTypeId)) {
    throw new InspectorServiceTypeIneligibleError();
  }

  // Eligible only when the inspector can serve EVERY agency in the group;
  // an empty tenant set must not pass (see accept-offer for rationale).
  if (tenantIds.length === 0 || !tenantIds.every((t) => inspector.isEligibleForTenant(t))) {
    throw new InspectorIneligibleError();
  }

  // Validate inspector's regions cover the service group's properties
  if (propertyIds.length > 0) {
    const coveredPropertyIds = await serviceRegionRepo.findPropertyIdsInInspectorRegions(inspector.id);
    const coveredSet = new Set(coveredPropertyIds);
    const uncoveredProperties = propertyIds.filter((pid) => !coveredSet.has(pid));
    if (uncoveredProperties.length > 0) {
      throw new InspectorIneligibleError();
    }
  }
}
