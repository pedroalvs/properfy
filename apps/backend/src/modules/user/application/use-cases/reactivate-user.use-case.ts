import type { AuthContext } from '@properfy/shared';
import type { IUserManagementRepository } from '../../domain/user-management.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  UserNotFoundError,
  UserAlreadyActiveError,
} from '../../domain/user-management.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ReactivateUserInput {
  tenantId: string | null;
  userId: string;
  actor: AuthContext;
  reason?: string;
}

export class ReactivateUserUseCase {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ReactivateUserInput): Promise<void> {
    const { tenantId, userId, reason, actor } = input;

    // RBAC mirrors deactivate-user.use-case: AM crosses tenants and manages
    // internal (tenant-less) users; CL_ADMIN and OP are scoped to their own tenant.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'user.reactivate',
      entityType: 'User',
    });

    if (
      (actor.role === 'CL_ADMIN' || actor.role === 'OP') &&
      actor.tenantId !== tenantId
    ) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You can only reactivate users from your own tenant',
      );
    }

    // Internal (tenant-less) users can only be reactivated by AM.
    if (tenantId === null && actor.role !== 'AM') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'You are not allowed to reactivate internal users',
      );
    }

    // CL_ADMIN can only manage users if the tenant setting allows it
    if (actor.role === 'CL_ADMIN' && tenantId) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (tenant && tenant.settingsJson.allowClientUserManagement !== true) {
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'Client user management is not enabled for this agency',
        );
      }
    }

    const user = await this.userManagementRepo.findByIdAndTenantId(
      userId,
      tenantId,
    );
    if (!user) {
      throw new UserNotFoundError();
    }

    if (user.isActive()) {
      throw new UserAlreadyActiveError();
    }

    await this.userManagementRepo.update(userId, tenantId, {
      status: 'ACTIVE',
    });

    this.auditService.log({
      action: 'user.reactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId,
      before: { status: user.status },
      after: { status: 'ACTIVE' },
      reason,
    });
  }
}
