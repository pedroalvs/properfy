import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
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
  tenantName: string;
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: Date;
  timeWindow: string;
  priorityMode: string;
  priorityExpiresAt: Date | null;
  suburbs: string[];
  payoutEstimate: number | null;
  appointmentCount: number;
}

export interface GetMarketplaceOffersOutput {
  data: MarketplaceOfferOutput[];
  total: number;
}

export class GetMarketplaceOffersUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly inspectorRepo: IInspectorRepository,
  ) {}

  async execute(input: GetMarketplaceOffersInput): Promise<GetMarketplaceOffersOutput> {
    const { actor, inspectorId, pagination } = input;

    if (actor.role !== 'INSP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Only inspectors can view marketplace offers');
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

    const [data, total] = await Promise.all([
      this.serviceGroupRepo.findPublishedForInspector(
        inspector.id,
        serviceTypeIds,
        eligibleTenantIds,
        pagination,
      ),
      this.serviceGroupRepo.countPublishedForInspector(
        inspector.id,
        serviceTypeIds,
        eligibleTenantIds,
      ),
    ]);

    return {
      data: data.map((offer) => ({
        groupId: offer.groupId,
        tenantName: offer.tenantName,
        serviceTypeName: offer.serviceTypeName,
        groupSize: offer.groupSize,
        scheduledDate: offer.scheduledDate,
        timeWindow: offer.timeWindow,
        priorityMode: offer.priorityMode,
        priorityExpiresAt: offer.priorityExpiresAt,
        suburbs: offer.suburbs,
        payoutEstimate: offer.payoutEstimate,
        appointmentCount: offer.appointmentCount,
      })),
      total,
    };
  }
}
