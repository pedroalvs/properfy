import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { ResetUserPasswordUseCase } from '../../../user/application/use-cases/reset-user-password.use-case';
import {
  InspectorNotFoundError,
  InspectorNoLoginAccountError,
} from '../../domain/inspector.errors';

export interface ResetInspectorPasswordInput {
  inspectorId: string;
  newPassword: string;
  actor: AuthContext;
}

/**
 * Operator-initiated password reset for an inspector.
 *
 * Inspectors are excluded from the users list and no read API exposes their
 * linked `userId`, so the generic user reset endpoint is unreachable for them.
 * This resolves the inspector to its login account and delegates, reusing the
 * whole password pipeline (strength, blacklist, same-as-current, 5-entry
 * history, session revocation, account unlock) rather than duplicating it.
 */
export class ResetInspectorPasswordUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly resetUserPasswordUseCase: ResetUserPasswordUseCase,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ResetInspectorPasswordInput): Promise<void> {
    const { inspectorId, newPassword, actor } = input;

    // Asserted before the lookup so the 403 does not double as an oracle for
    // whether a given inspector id exists.
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.reset_password',
      entityType: 'Inspector',
    });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new InspectorNotFoundError();
    }

    if (!inspector.userId) {
      throw new InspectorNoLoginAccountError();
    }

    // Inspector accounts are cross-tenant: their users row has tenant_id IS NULL.
    await this.resetUserPasswordUseCase.execute({
      tenantId: null,
      userId: inspector.userId,
      newPassword,
      actor,
    });

    // The delegate audits against entityType 'User' with the INSP user id, which
    // no API surfaces. This second row keeps the reset reachable from the
    // inspector aggregate, matching how composed use cases audit elsewhere.
    this.auditService.log({
      action: 'inspector.password_reset',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      metadata: {
        userId: inspector.userId,
        resetByRole: actor.role,
      },
    });
  }
}
