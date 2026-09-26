import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';

export interface ResolveRegionsInput {
  appointmentIds: string[];
  /**
   * Accepted for backward compatibility but no longer used: region matching is
   * cross-tenant, so the caller's agency no longer scopes the result.
   */
  tenantId?: string;
  actor: AuthContext;
}

export interface ResolvedRegionItem {
  regionId: string;
  regionNumber: number;
  regionName: string;
  color: string;
  matchedAppointmentCount: number;
  inspectorCount: number;
}

export interface ResolveRegionsOutput {
  regions: ResolvedRegionItem[];
  totalAppointments: number;
  unmatchedAppointmentIds: string[];
}

export class ResolveRegionsUseCase {
  constructor(
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ResolveRegionsInput): Promise<ResolveRegionsOutput> {
    const { actor, appointmentIds } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.resolve', entityType: 'ServiceRegion' });

    // Cross-tenant: matching no longer depends on the actor's agency, so no
    // tenantId is required (AM/OP with no agency selected resolve fine).
    const resolved = await this.serviceRegionRepo.resolveRegionsForAppointments(appointmentIds);

    // Collect all matched appointment IDs across all regions (deduplicated)
    const allMatchedIds = new Set<string>();
    for (const region of resolved) {
      for (const id of region.matchedAppointmentIds) {
        allMatchedIds.add(id);
      }
    }

    const unmatchedAppointmentIds = appointmentIds.filter((id) => !allMatchedIds.has(id));

    // One batched query for all matched regions' inspector counts (was N+1).
    const inspectorCounts = await this.serviceRegionRepo.countActiveInspectorsInRegions(
      resolved.map((r) => r.regionId),
    );

    const regions: ResolvedRegionItem[] = resolved.map((r) => ({
      regionId: r.regionId,
      regionNumber: r.regionNumber,
      regionName: r.regionName,
      color: r.color,
      matchedAppointmentCount: r.matchedAppointmentIds.length,
      inspectorCount: inspectorCounts.get(r.regionId) ?? 0,
    }));

    return {
      regions,
      totalAppointments: appointmentIds.length,
      unmatchedAppointmentIds,
    };
  }
}
