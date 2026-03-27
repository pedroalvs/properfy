import type { AuthContext } from '@properfy/shared';
import type {
  IUserManagementRepository,
  UserManagementFilters,
  PaginationParams,
} from '../../domain/user-management.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ListUsersInput {
  tenantId: string | null;
  filters: UserManagementFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListUsersUserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  branchId: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListUsersOutput {
  data: ListUsersUserItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListUsersUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
  ) {}

  async execute(input: ListUsersInput): Promise<ListUsersOutput> {
    const { tenantId, filters, pagination, actor } = input;

    if (tenantId === null) {
      if (actor.role !== 'AM' && actor.role !== 'OP') {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You are not allowed to list internal users',
        );
      }
    } else if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.tenantId !== tenantId
    ) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You can only list users from your own tenant',
      );
    }

    const [users, total] = await Promise.all([
      this.userManagementRepo.findByTenantId(tenantId, filters, pagination),
      this.userManagementRepo.countByTenantId(tenantId, filters),
    ]);

    return {
      data: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
