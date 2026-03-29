import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionNotFoundError } from '../../domain/service-region.errors';

export interface GetServiceRegionInput {
  regionId: string;
  actor: AuthContext;
}

export interface SuburbDetail {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postcode: string | null;
  status: string;
}

export interface GetServiceRegionOutput {
  id: string;
  name: string;
  state: string;
  country: string;
  status: string;
  suburbs: SuburbDetail[];
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
      state: region.state,
      country: region.country,
      status: region.status,
      suburbs: region.suburbs.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        country: s.country,
        postcode: s.postcode,
        status: s.status,
      })),
      createdAt: region.createdAt,
      updatedAt: region.updatedAt,
    };
  }
}
