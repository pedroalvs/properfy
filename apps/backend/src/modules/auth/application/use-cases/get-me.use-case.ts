import type { IUserRepository } from '../../domain/user.repository';
import type { UserRole, UserStatus } from '@properfy/shared';
import { UnauthorizedError } from '../../../../shared/domain/errors';

export interface GetMeOutput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  tenantId: string | null;
  branchId: string | null;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export class GetMeUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetMeOutput> {
    const user = await this.userRepo.findById(userId);

    if (!user || user.isDeleted() || user.isInactive()) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      tenantId: user.tenantId,
      branchId: user.branchId,
      totpEnabled: user.totpEnabled,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
