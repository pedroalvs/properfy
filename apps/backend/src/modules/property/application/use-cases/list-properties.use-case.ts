import type { AuthContext } from '@properfy/shared';
import {
  ForbiddenError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type {
  IPropertyRepository,
  PropertyFilters,
  PaginationParams,
} from '../../domain/property.repository';

export interface ListPropertiesInput {
  filters: {
    tenantId?: string;
    branchId?: string;
    type?: string;
    search?: string;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListPropertiesOutput {
  data: Array<{
    id: string;
    tenantId: string;
    branchId: string | null;
    propertyCode: string;
    type: string;
    street: string;
    addressLine2: string | null;
    suburb: string;
    postcode: string;
    state: string;
    country: string;
    geocodingStatus: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListPropertiesUseCase {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async execute(input: ListPropertiesInput): Promise<ListPropertiesOutput> {
    const { filters, pagination, actor } = input;

    // Resolve tenantId
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      if (!filters.tenantId) {
        throw new ValidationError(
          'tenantId filter is required for AM/OP roles',
        );
      }
      tenantId = filters.tenantId;
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = actor.tenantId!;
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const repoFilters: PropertyFilters = {
      tenantId,
      branchId: filters.branchId,
      type: filters.type,
      search: filters.search,
    };

    const [data, total] = await Promise.all([
      this.propertyRepo.findAll(repoFilters, pagination),
      this.propertyRepo.count(repoFilters),
    ]);

    return {
      data: data.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        branchId: p.branchId,
        propertyCode: p.propertyCode,
        type: p.type,
        street: p.street,
        addressLine2: p.addressLine2,
        suburb: p.suburb,
        postcode: p.postcode,
        state: p.state,
        country: p.country,
        geocodingStatus: p.geocodingStatus,
        notes: p.notes,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
