import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { MarketplaceOfferDetail } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IOfferEarlyAccessPolicy } from '../../domain/offer-early-access.policy';
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
    private readonly earlyAccessPolicy: IOfferEarlyAccessPolicy,
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

    // Resolve the early-access window once; an in-window group is hidden from an
    // under-level inspector exactly as in the list (the existing 404 then fires).
    const earlyAccess = await this.earlyAccessPolicy.resolve(inspector.id, new Date());

    const detail = await this.serviceGroupRepo.findPublishedOfferDetail(
      groupId,
      inspector.id,
      serviceTypeIds,
      blockedTenantIds,
      earlyAccess,
    );

    if (!detail) {
      throw new NotFoundError('MARKETPLACE_OFFER_NOT_FOUND', 'Marketplace offer not found or not eligible');
    }

    return detail;
  }
}
