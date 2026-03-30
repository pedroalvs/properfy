import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import {
  ServiceRegionNotFoundError,
  ServiceRegionAlreadyInactiveError,
} from '../../domain/service-region.errors';

export interface DeactivateServiceRegionInput {
  regionId: string;
  reason: string;
  actor: AuthContext;
}

export interface DeactivateServiceRegionOutput {
  id: string;
  name: string;
  status: string;
  deactivatedAt: Date;
}

export class DeactivateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeactivateServiceRegionInput): Promise<DeactivateServiceRegionOutput> {
    const { regionId, reason, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const region = await this.regionRepo.findById(regionId);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    if (!region.isActive()) {
      throw new ServiceRegionAlreadyInactiveError();
    }

    const now = new Date();
    await this.regionRepo.update(regionId, { status: 'INACTIVE' });

    this.auditService.log({
      action: 'service_region.deactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceRegion',
      entityId: regionId,
      before: { status: region.status },
      after: { status: 'INACTIVE' },
      reason,
    });

    return {
      id: regionId,
      name: region.name,
      status: 'INACTIVE',
      deactivatedAt: now,
    };
  }
}
