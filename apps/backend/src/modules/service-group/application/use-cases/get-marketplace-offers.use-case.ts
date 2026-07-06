import type { AuthContext } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository, PaginationParams } from '../../domain/service-group.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import { InspectorInactiveError } from '../../domain/service-group.errors';

export interface GetMarketplaceOffersInput {
  inspectorId: string;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface MarketplaceOfferOutput {
  groupId: string;
  groupNumber: number;
  code: string;
  tenantName: string;
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: Date;
  timeWindow: string;
  suburbs: string[];
  payoutEstimate: number | null;
  appointmentCount: number;
  centroid: { lat: number; lng: number } | null;
}

export interface GetMarketplaceOffersOutput {
  data: MarketplaceOfferOutput[];
  total: number;
}

export class GetMarketplaceOffersUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetMarketplaceOffersInput): Promise<GetMarketplaceOffersOutput> {
    const { actor, inspectorId, pagination } = input;

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

    const [data, total] = await Promise.all([
      this.serviceGroupRepo.findPublishedForInspector(
        inspector.id,
        serviceTypeIds,
        blockedTenantIds,
        pagination,
      ),
      this.serviceGroupRepo.countPublishedForInspector(
        inspector.id,
        serviceTypeIds,
        blockedTenantIds,
      ),
    ]);

    return {
      data: data.map((offer) => ({
        groupId: offer.groupId,
        groupNumber: offer.groupNumber,
        code: offer.code,
        tenantName: offer.tenantName,
        serviceTypeName: offer.serviceTypeName,
        groupSize: offer.groupSize,
        scheduledDate: offer.scheduledDate,
        timeWindow: offer.timeWindow,
        suburbs: offer.suburbs,
        payoutEstimate: offer.payoutEstimate,
        appointmentCount: offer.appointmentCount,
        centroid: offer.centroid,
      })),
      total,
    };
  }
}
