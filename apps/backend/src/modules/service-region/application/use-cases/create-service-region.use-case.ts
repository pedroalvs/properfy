import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import type { ISuburbRepository } from '../../domain/suburb.repository';
import { ServiceRegionEntity } from '../../domain/service-region.entity';
import { SuburbNotFoundError } from '../../domain/service-region.errors';

export interface CreateServiceRegionInput {
  name: string;
  state: string;
  country: string;
  suburbIds: string[];
  actor: AuthContext;
}

export interface CreateServiceRegionOutput {
  id: string;
  name: string;
  state: string;
  country: string;
  status: string;
  suburbCount: number;
  createdAt: Date;
}

export class CreateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly suburbRepo: ISuburbRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateServiceRegionInput): Promise<CreateServiceRegionOutput> {
    const { name, state, country, suburbIds, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Validate all suburbs exist and fetch their data
    const suburbProps = [];
    for (const suburbId of suburbIds) {
      const suburb = await this.suburbRepo.findById(suburbId);
      if (!suburb) {
        throw new SuburbNotFoundError();
      }
      suburbProps.push({
        id: suburb.id,
        name: suburb.name,
        city: suburb.city,
        state: suburb.state,
        country: suburb.country,
        postcode: suburb.postcode,
        status: suburb.status,
        createdAt: suburb.createdAt,
      });
    }

    // Validate all suburbs belong to the region's country
    const invalidSuburbs = suburbProps.filter((s) => s.country !== country);
    if (invalidSuburbs.length > 0) {
      throw new ValidationError(
        `Suburbs must belong to country ${country}: ${invalidSuburbs.map((s) => s.name).join(', ')}`,
      );
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const region = new ServiceRegionEntity({
      id,
      name,
      state,
      country,
      status: 'ACTIVE',
      suburbs: suburbProps,
      createdAt: now,
      updatedAt: now,
    });

    await this.regionRepo.save(region);

    this.auditService.log({
      action: 'service_region.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceRegion',
      entityId: id,
      after: {
        id,
        name,
        state,
        country,
        status: 'ACTIVE',
        suburbIds,
      },
    });

    return {
      id,
      name,
      state,
      country,
      status: 'ACTIVE',
      suburbCount: suburbIds.length,
      createdAt: now,
    };
  }
}
