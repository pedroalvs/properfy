import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { MarketplaceOfferDetail } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import { InspectorInactiveError } from '../../domain/service-group.errors';

export interface GetMarketplaceOfferDetailInput {
  groupId: string;
  inspectorId: string;
  actor: AuthContext;
}

export type GetMarketplaceOfferDetailOutput = MarketplaceOfferDetail;

export class GetMarketplaceOfferDetailUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetMarketplaceOfferDetailInput): Promise<GetMarketplaceOfferDetailOutput> {
    const { actor, groupId, inspectorId } = input;

    this.authorizationService.assertRoles(actor, ['INSP'], { action: 'marketplace.view_offers', entityType: 'ServiceGroup' });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    if (!inspector.isActive()) {
      throw new InspectorInactiveError();
    }

    const serviceTypeIds = inspector.serviceTypesJson.map((s) => s.serviceTypeId);
    // Use the denylist model (matches AcceptOfferUseCase via Inspector.isEligibleForTenant).
    // Empty list = eligible for every tenant.
    const blockedTenantIds = inspector.blockedClientsJson;

    const detail = await this.serviceGroupRepo.findPublishedOfferDetail(
      groupId,
      inspector.id,
      serviceTypeIds,
      blockedTenantIds,
    );

    if (!detail) {
      throw new NotFoundError('MARKETPLACE_OFFER_NOT_FOUND', 'Marketplace offer not found or not eligible');
    }

    return detail;
  }
}
