import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionNotFoundError } from '../../domain/service-region.errors';

export interface UpdateServiceRegionInput {
  regionId: string;
  name?: string;
  geojson?: Record<string, unknown>;
  color?: string;
  actor: AuthContext;
}

export interface UpdateServiceRegionOutput {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: string;
  updatedAt: Date;
}

export class UpdateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: UpdateServiceRegionInput): Promise<UpdateServiceRegionOutput> {
    const { regionId, name, geojson, color, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.update', entityType: 'ServiceRegion' });

    // AM has tenantId=null in JWT; load region unscoped and derive tenantId from entity
    const region = await this.regionRepo.findById(regionId, actor.tenantId ?? null);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    const tenantId = region.tenantId;

    // No app-level findByName pre-check here: it was race-prone (two concurrent
    // renames both pass it, then one violates the DB). The case-insensitive
    // unique index is the source of truth; the repository translates its
    // violation into ServiceRegionNameConflictError (#614).

    const before = {
      name: region.name,
      color: region.color,
    };

    // `status` is deliberately not updatable here — status transitions go
    // through deactivate/reactivate so they capture a reason + audit (#387).
    const updateData: Partial<{
      name: string;
      geojson: Record<string, unknown>;
      color: string;
    }> = {};
    if (name !== undefined) updateData.name = name;
    if (geojson !== undefined) updateData.geojson = geojson;
    if (color !== undefined) updateData.color = color;

    if (Object.keys(updateData).length > 0) {
      await this.regionRepo.update(regionId, tenantId, updateData);
    }

    const updated = await this.regionRepo.findById(regionId, tenantId);

    const after = {
      name: updated?.name ?? region.name,
      color: updated?.color ?? region.color,
    };

    this.auditService.log({
      action: 'service_region.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceRegion',
      entityId: regionId,
      before,
      after,
    });

    return {
      id: regionId,
      name: updated?.name ?? region.name,
      geojson: updated?.geojson ?? region.geojson,
      color: updated?.color ?? region.color,
      status: updated?.status ?? region.status,
      // Echo the persisted timestamp, not a synthetic one — the re-read entity
      // is already in hand (#615).
      updatedAt: updated?.updatedAt ?? region.updatedAt,
    };
  }

}
