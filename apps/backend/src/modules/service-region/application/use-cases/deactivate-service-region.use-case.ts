import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_REGION_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import {
  ServiceRegionNotFoundError,
  ServiceRegionAlreadyInactiveError,
  ServiceRegionHasPublishedGroupsError,
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
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: DeactivateServiceRegionInput): Promise<DeactivateServiceRegionOutput> {
    const { regionId, reason, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.delete', entityType: 'ServiceRegion' });

    // AM has tenantId=null; load region tenant-unscoped and derive tenantId from entity
    const region = await this.regionRepo.findById(regionId, actor.tenantId ?? null);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    const tenantId = region.tenantId;

    if (!region.isActive()) {
      throw new ServiceRegionAlreadyInactiveError();
    }

    // Guard: block deactivation when published service groups reference this region
    const publishedCount = await this.regionRepo.countPublishedGroupsByRegionId(regionId);
    if (publishedCount > 0) {
      throw new ServiceRegionHasPublishedGroupsError();
    }

    const now = new Date();
    await this.regionRepo.update(regionId, tenantId, { status: 'INACTIVE' });

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

    this.eventBus?.emit({
      type: SERVICE_REGION_EVENTS.DEACTIVATED,
      payload: { regionId, tenantId, regionName: region.name },
      occurredAt: new Date(),
    });

    return {
      id: regionId,
      name: region.name,
      status: 'INACTIVE',
      deactivatedAt: now,
    };
  }
}
