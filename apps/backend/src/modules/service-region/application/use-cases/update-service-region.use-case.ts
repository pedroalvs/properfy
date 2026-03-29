import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import type { ISuburbRepository } from '../../domain/suburb.repository';
import { ServiceRegionNotFoundError, SuburbNotFoundError } from '../../domain/service-region.errors';

export interface UpdateServiceRegionInput {
  regionId: string;
  name?: string;
  status?: string;
  addSuburbIds?: string[];
  removeSuburbIds?: string[];
  actor: AuthContext;
}

export interface UpdateServiceRegionOutput {
  id: string;
  name: string;
  state: string;
  country: string;
  status: string;
  suburbCount: number;
  updatedAt: Date;
}

export class UpdateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly suburbRepo: ISuburbRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateServiceRegionInput): Promise<UpdateServiceRegionOutput> {
    const { regionId, name, status, addSuburbIds, removeSuburbIds, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const region = await this.regionRepo.findById(regionId);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    const before = {
      name: region.name,
      status: region.status,
      suburbCount: region.suburbs.length,
    };

    // Validate suburbs to add
    if (addSuburbIds && addSuburbIds.length > 0) {
      for (const suburbId of addSuburbIds) {
        const suburb = await this.suburbRepo.findById(suburbId);
        if (!suburb) {
          throw new SuburbNotFoundError();
        }
      }
    }

    // Update region fields
    const updateData: Partial<{ name: string; status: string }> = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length > 0) {
      await this.regionRepo.update(regionId, updateData);
    }

    // Add suburbs
    if (addSuburbIds && addSuburbIds.length > 0) {
      await this.regionRepo.addSuburbs(regionId, addSuburbIds);
    }

    // Remove suburbs
    if (removeSuburbIds && removeSuburbIds.length > 0) {
      await this.regionRepo.removeSuburbs(regionId, removeSuburbIds);
    }

    // Re-fetch to get updated data
    const updated = await this.regionRepo.findById(regionId);

    const after = {
      name: updated?.name ?? region.name,
      status: updated?.status ?? region.status,
      suburbCount: updated?.suburbs.length ?? region.suburbs.length,
      addedSuburbs: addSuburbIds ?? [],
      removedSuburbs: removeSuburbIds ?? [],
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
      state: updated?.state ?? region.state,
      country: updated?.country ?? region.country,
      status: updated?.status ?? region.status,
      suburbCount: updated?.suburbs.length ?? region.suburbs.length,
      updatedAt: new Date(),
    };
  }
}
