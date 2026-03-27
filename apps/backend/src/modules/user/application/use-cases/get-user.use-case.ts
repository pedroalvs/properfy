import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import { UserNotFoundError } from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface GetUserInput {
  tenantId: string | null;
  userId: string;
  actor: AuthContext;
}

export interface GetUserOutput {
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

export class GetUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
  ) {}

  async execute(input: GetUserInput): Promise<GetUserOutput> {
    const { tenantId, userId, actor } = input;

    // RBAC: AM/OP can access any tenant; CL_ADMIN/CL_USER own tenant only
    if (tenantId === null) {
      if (actor.role !== 'AM' && actor.role !== 'OP') {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'You are not allowed to access internal users',
        );
      }
    } else if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.tenantId !== tenantId
    ) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You can only access users from your own tenant',
      );
    }

    const user = await this.userManagementRepo.findByIdAndTenantId(
      userId,
      tenantId,
    );
    if (!user) {
      throw new UserNotFoundError();
    }

    return {
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
    };
  }
}
