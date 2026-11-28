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
import { requireTenantScope } from '../../../../shared/domain/require-tenant-scope';

export interface ReactivateUserInput {
  tenantId: string | null;
  userId: string;
  actor: AuthContext;
  reason?: string;
  requestId?: string;
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

    // AM crosses tenants and manages internal (tenant-less) users; OP is
    // cross-tenant over agency users (root CLAUDE.md §6, DEC-003); only
    // CL_ADMIN is confined to its own tenant.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'user.reactivate',
      entityType: 'User',
    });

    // Confine only tenant-pinned roles to their own tenant via the canonical
    // classification: `requireTenantScope` returns `undefined` for cross-tenant
    // roles (AM/OP), so OP — which already creates, edits and deactivates agency
    // users — reactivates them across tenants too, and a future pinned role is
    // covered automatically. (assertRoles above already excludes the other-key
    // roles that `requireTenantScope` would throw for.)
    const pinnedTenant = requireTenantScope(actor, 'user.reactivate');
    if (pinnedTenant !== undefined && pinnedTenant !== tenantId) {
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

    const updated = await this.userManagementRepo.update(userId, tenantId, {
      status: 'ACTIVE',
    });
    // update() now reports whether a live row matched (#240). If the user was
    // soft-deleted between the find above and this write, do not audit a
    // reactivation that never happened.
    if (!updated) {
      throw new UserNotFoundError();
    }

    this.auditService.log({
      action: 'user.reactivated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'User',
      entityId: userId,
      tenantId,
      requestId: input.requestId,
      before: { status: user.status },
      after: { status: 'ACTIVE' },
      reason,
    });
  }
}
