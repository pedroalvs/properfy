import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionNotFoundError } from '../../domain/service-region.errors';

export interface GetServiceRegionInput {
  regionId: string;
  actor: AuthContext;
}

export interface GetServiceRegionOutput {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class GetServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
  ) {}

  async execute(input: GetServiceRegionInput): Promise<GetServiceRegionOutput> {
    const { regionId, actor } = input;

    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'INSP'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const region = await this.regionRepo.findById(regionId);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    return {
      id: region.id,
      name: region.name,
      geojson: region.geojson,
      color: region.color,
      status: region.status,
      createdByUserId: region.createdByUserId,
      createdAt: region.createdAt,
      updatedAt: region.updatedAt,
    };
  }
}
