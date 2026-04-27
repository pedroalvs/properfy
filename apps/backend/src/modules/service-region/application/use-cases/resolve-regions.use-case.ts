import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';

export interface ResolveRegionsInput {
  appointmentIds: string[];
  /** Required for AM/OP callers whose JWT carries no tenantId (cross-tenant). */
  tenantId?: string;
  actor: AuthContext;
}

export interface ResolvedRegionItem {
  regionId: string;
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

    const tenantId = this.resolveTenantId(actor, input.tenantId);

    const resolved = await this.serviceRegionRepo.resolveRegionsForAppointments(tenantId, appointmentIds);

    // Collect all matched appointment IDs across all regions (deduplicated)
    const allMatchedIds = new Set<string>();
    for (const region of resolved) {
      for (const id of region.matchedAppointmentIds) {
        allMatchedIds.add(id);
      }
    }

    const unmatchedAppointmentIds = appointmentIds.filter((id) => !allMatchedIds.has(id));

    // Fetch inspector counts for each matched region
    const regions: ResolvedRegionItem[] = await Promise.all(
      resolved.map(async (r) => ({
        regionId: r.regionId,
        regionName: r.regionName,
        color: r.color,
        matchedAppointmentCount: r.matchedAppointmentIds.length,
        inspectorCount: await this.serviceRegionRepo.countActiveInspectorsInRegion(r.regionId),
      })),
    );

    return {
      regions,
      totalAppointments: appointmentIds.length,
      unmatchedAppointmentIds,
    };
  }

  /**
   * For AM/OP (cross-tenant roles): use JWT tenantId when present, otherwise
   * fall back to the explicitly supplied tenantId from the request body.
   * Throws 403 when neither source provides a tenant.
   *
   * For tenant-scoped roles (CL_ADMIN, CL_USER, INSP): pin to JWT tenantId
   * and ignore any body-supplied value (defense-in-depth).
   */
  private resolveTenantId(actor: AuthContext, requestedTenantId?: string): string {
    if (actor.role === 'AM' || actor.role === 'OP') {
      const tenantId = actor.tenantId ?? requestedTenantId;
      if (!tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'tenantId is required for cross-tenant region resolution');
      }
      return tenantId;
    }
    if (!actor.tenantId) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Tenant context is required');
    }
    return actor.tenantId;
  }
}
