import type { AuthContext } from '@properfy/shared';
import { resolveTenantScope } from '../resolve-tenant-scope';
import type { IPropertyRepository } from '../../domain/property.repository';

export interface GetPropertySummaryInput {
  filters: {
    tenantId?: string;
    branchId?: string;
    search?: string;
  };
  actor: AuthContext;
}

export interface GetPropertySummaryOutput {
  totalCount: number;
  houseCount: number;
  apartmentCount: number;
}

export class GetPropertySummaryUseCase {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async execute(input: GetPropertySummaryInput): Promise<GetPropertySummaryOutput> {
    const { filters, actor } = input;

    const tenantId = resolveTenantScope(actor, filters.tenantId);

    const countsByType = await this.propertyRepo.countByType({
      tenantId,
      branchId: filters.branchId,
      search: filters.search,
    });

    const totalCount = Object.values(countsByType).reduce((sum, n) => sum + n, 0);

    return {
      totalCount,
      houseCount: countsByType.HOUSE ?? 0,
      apartmentCount: countsByType.APARTMENT ?? 0,
    };
  }
}
