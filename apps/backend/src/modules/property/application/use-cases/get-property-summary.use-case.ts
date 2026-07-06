import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
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

    // Same tenant resolution as ListPropertiesUseCase: AM/OP are cross-tenant
    // (filters.tenantId narrows); CL roles are pinned to their JWT tenantId and
    // fail closed when it is missing (no business query without tenant scope).
    let tenantId: string | undefined;
    if (actor.role === 'AM' || actor.role === 'OP') {
      tenantId = filters.tenantId;
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      tenantId = actor.tenantId;
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

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
