import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import { ServiceRegionEntity } from '../../domain/service-region.entity';

export interface CreateServiceRegionInput {
  name: string;
  geojson: Record<string, unknown>;
  color?: string;
  actor: AuthContext;
}

export interface CreateServiceRegionOutput {
  id: string;
  name: string;
  geojson: Record<string, unknown>;
  color: string;
  status: string;
  createdAt: Date;
}

export class CreateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: CreateServiceRegionInput): Promise<CreateServiceRegionOutput> {
    const { name, geojson, color, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const resolvedColor = color ?? '#3b82f6';

    const region = new ServiceRegionEntity({
      id,
      name,
      geojson,
      color: resolvedColor,
      status: 'ACTIVE',
      createdByUserId: actor.userId,
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
        color: resolvedColor,
        status: 'ACTIVE',
      },
    });

    return {
      id,
      name,
      geojson,
      color: resolvedColor,
      status: 'ACTIVE',
      createdAt: now,
    };
  }
}
