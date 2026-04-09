import type { AuthContext } from '@properfy/shared';
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';

export interface LinkInspectorToUserInput {
  inspectorId: string;
  userId: string;
  actor: AuthContext;
}

export class LinkInspectorToUserUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly userRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: LinkInspectorToUserInput): Promise<void> {
    const { inspectorId, userId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.update',
      entityType: 'Inspector',
    });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');
    }

    if (inspector.userId !== null) {
      throw new ConflictError('INSPECTOR_ALREADY_LINKED', 'Inspector is already linked to a user account');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    }

    if (user.role !== 'INSP') {
      throw new ConflictError('USER_NOT_INSPECTOR', 'User must have the INSP role to be linked to an inspector');
    }

    const existingInspector = await this.inspectorRepo.findByUserId(userId);
    if (existingInspector) {
      throw new ConflictError('USER_ALREADY_LINKED', 'User is already linked to another inspector');
    }

    await this.inspectorRepo.linkUserId(inspectorId, userId);

    this.auditService.log({
      action: 'inspector.user_linked',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      after: {
        inspectorId,
        userId,
      },
    });
  }
}
