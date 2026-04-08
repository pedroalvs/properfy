import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
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
  ) {}

  async execute(input: GetMarketplaceOfferDetailInput): Promise<GetMarketplaceOfferDetailOutput> {
    const { actor, groupId, inspectorId } = input;

    if (actor.role !== 'INSP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Only inspectors can view marketplace offer details');
    }

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    if (!inspector.isActive()) {
      throw new InspectorInactiveError();
    }

    const serviceTypeIds = inspector.serviceTypesJson.map((s) => s.serviceTypeId);
    const eligibleTenantIds = inspector.clientEligibilityJson
      .filter((c) => c.eligible)
      .map((c) => c.tenantId);

    const detail = await this.serviceGroupRepo.findPublishedOfferDetail(
      groupId,
      inspector.id,
      serviceTypeIds,
      eligibleTenantIds,
    );

    if (!detail) {
      throw new NotFoundError('MARKETPLACE_OFFER_NOT_FOUND', 'Marketplace offer not found or not eligible');
    }

    return detail;
  }
}
