import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IInspectorRepository,
  InspectorFilters,
  PaginationParams,
} from '../../domain/inspector.repository';

export interface ListInspectorsInput {
  filters: InspectorFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListInspectorsOutput {
  data: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    regionsJson: string[];
    serviceTypesJson: string[];
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListInspectorsUseCase {
  constructor(private readonly inspectorRepo: IInspectorRepository) {}

  async execute(input: ListInspectorsInput): Promise<ListInspectorsOutput> {
    const { pagination, actor } = input;
    let { filters } = input;

    // TODO: INSP role should be allowed to list own record once User-Inspector link is established
    if (actor.role === 'INSP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // CL_ADMIN and CL_USER can only see eligible inspectors for their tenant
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
      }
      filters = { ...filters, tenantId: actor.tenantId };
    }

    const [data, total] = await Promise.all([
      this.inspectorRepo.findAll(filters, pagination),
      this.inspectorRepo.count(filters),
    ]);

    return {
      data: data.map((i) => ({
        id: i.id,
        name: i.name,
        email: i.email,
        phone: i.phone,
        status: i.status,
        regionsJson: i.regionsJson,
        serviceTypesJson: i.serviceTypesJson,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
