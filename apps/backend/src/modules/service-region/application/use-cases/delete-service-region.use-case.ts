import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import {
  ServiceRegionNotFoundError,
  ServiceRegionStillActiveError,
} from '../../domain/service-region.errors';

export interface DeleteServiceRegionInput {
  regionId: string;
  actor: AuthContext;
}

export class DeleteServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeleteServiceRegionInput): Promise<void> {
    const { regionId, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const region = await this.regionRepo.findById(regionId);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    if (region.isActive()) {
      throw new ServiceRegionStillActiveError();
    }

    await this.regionRepo.delete(regionId);

    this.auditService.log({
      action: 'service_region.deleted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceRegion',
      entityId: regionId,
      before: { id: region.id, name: region.name, status: region.status },
      after: null,
    });
  }
}
