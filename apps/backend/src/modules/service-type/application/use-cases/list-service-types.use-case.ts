import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IServiceTypeRepository,
  ServiceTypeFilters,
  PaginationParams,
} from '../../domain/service-type.repository';

export interface ListServiceTypesInput {
  filters: ServiceTypeFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListServiceTypesOutput {
  data: Array<{
    id: string;
    code: string;
    name: string;
    flowType: string;
    requiresTenantConfirmation: boolean;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

const ALLOWED_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP'] as const;

export class ListServiceTypesUseCase {
  constructor(private readonly serviceTypeRepo: IServiceTypeRepository) {}

  async execute(input: ListServiceTypesInput): Promise<ListServiceTypesOutput> {
    const { filters, pagination, actor } = input;

    if (!ALLOWED_ROLES.includes(actor.role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const [data, total] = await Promise.all([
      this.serviceTypeRepo.findAll(filters, pagination),
      this.serviceTypeRepo.count(filters),
    ]);

    return {
      data: data.map((st) => ({
        id: st.id,
        code: st.code,
        name: st.name,
        flowType: st.flowType,
        requiresTenantConfirmation: st.requiresTenantConfirmation,
        status: st.status,
        createdAt: st.createdAt,
        updatedAt: st.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
