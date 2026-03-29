import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionNotFoundError } from '../../domain/service-region.errors';

export interface UpdateServiceRegionInput {
  regionId: string;
  name?: string;
  geojson?: Record<string, unknown>;
  color?: string;
  status?: string;
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
  ) {}

  async execute(input: UpdateServiceRegionInput): Promise<UpdateServiceRegionOutput> {
    const { regionId, name, geojson, color, status, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const region = await this.regionRepo.findById(regionId);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    const before = {
      name: region.name,
      color: region.color,
      status: region.status,
    };

    const updateData: Partial<{
      name: string;
      geojson: Record<string, unknown>;
      color: string;
      status: string;
    }> = {};
    if (name !== undefined) updateData.name = name;
    if (geojson !== undefined) updateData.geojson = geojson;
    if (color !== undefined) updateData.color = color;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length > 0) {
      await this.regionRepo.update(regionId, updateData);
    }

    const updated = await this.regionRepo.findById(regionId);

    const after = {
      name: updated?.name ?? region.name,
      color: updated?.color ?? region.color,
      status: updated?.status ?? region.status,
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
      updatedAt: new Date(),
    };
  }
}
