import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceRegionRepository } from '../../domain/service-region.repository';
import {
  ServiceRegionNotFoundError,
  ServiceRegionStillActiveError,
  ServiceRegionHasPublishedGroupsError,
} from '../../domain/service-region.errors';

export interface DeleteServiceRegionInput {
  regionId: string;
  actor: AuthContext;
}

export class DeleteServiceRegionUseCase {
  constructor(
    private readonly regionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: DeleteServiceRegionInput): Promise<void> {
    const { regionId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_region.delete', entityType: 'ServiceRegion' });

    const region = await this.regionRepo.findById(regionId, actor.tenantId ?? null);
    if (!region) {
      throw new ServiceRegionNotFoundError();
    }

    if (region.isActive()) {
      throw new ServiceRegionStillActiveError();
    }

    const publishedGroupCount = await this.regionRepo.countPublishedGroupsByRegionId(regionId);
    if (publishedGroupCount > 0) {
      throw new ServiceRegionHasPublishedGroupsError();
    }

    await this.regionRepo.delete(regionId, region.tenantId);

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
