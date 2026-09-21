import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_REGION_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import {
  ServiceRegionNotFoundError,
  ServiceRegionAlreadyActiveError,
} from '../../domain/service-region.errors';

export interface ReactivateServiceRegionInput {
  regionId: string;
  reason: string;
  actor: AuthContext;
}

export interface ReactivateServiceRegionOutput {
  id: string;
  name: string;
  status: string;
  reactivatedAt: Date;
}

/**
 * Restores an INACTIVE service region to ACTIVE. Mirrors
 * DeactivateServiceRegionUseCase: AM/OP only, requires a reason, and writes an
 * audit log — so status transitions never happen silently through PATCH (#387).
 */
export class ReactivateServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: ReactivateServiceRegionInput): Promise<ReactivateServiceRegionOutput> {
    const { regionId, reason, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.update', entityType: 'ServiceRegion' });

    // AM has tenantId=null; load region tenant-unscoped and derive tenantId from entity
    const region = await this.regionRepo.findById(regionId, actor.tenantId ?? null);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    const tenantId = region.tenantId;

    if (region.isActive()) {
      throw new ServiceRegionAlreadyActiveError();
    }

    const now = new Date();
    await this.regionRepo.update(regionId, tenantId, { status: 'ACTIVE' });

    this.auditService.log({
      action: 'service_region.reactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceRegion',
      entityId: regionId,
      before: { status: region.status },
      after: { status: 'ACTIVE' },
      reason,
    });

    this.eventBus?.emit({
      type: SERVICE_REGION_EVENTS.REACTIVATED,
      payload: { regionId, tenantId, regionName: region.name },
      occurredAt: new Date(),
    });

    return {
      id: regionId,
      name: region.name,
      status: 'ACTIVE',
      reactivatedAt: now,
    };
  }
}
