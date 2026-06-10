import type { AuthContext } from '@properfy/shared';
import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { INotificationTemplateRepository } from '../../domain/notification-template.repository';

export interface DeleteNotificationTemplateInput {
  templateId: string;
  actor: AuthContext;
}

/**
 * Hard-deletes a tenant override template. Restricted to AM/OP — CL_ADMIN can
 * create/edit their own override (via upsert) but deactivates rather than
 * deletes. Platform defaults (tenant_id = NULL) can never be deleted.
 */
export class DeleteNotificationTemplateUseCase {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DeleteNotificationTemplateInput): Promise<void> {
    const { actor, templateId } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'config.notification_templates.delete',
      entityType: 'NotificationTemplate',
      entityId: templateId,
    });

    const existing = await this.templateRepo.findById(templateId);
    if (!existing) {
      throw new NotFoundError('TEMPLATE_NOT_FOUND', 'Notification template not found');
    }
    if (existing.tenantId === null) {
      throw new ValidationError('Cannot delete a platform default template');
    }

    await this.templateRepo.delete(templateId);

    this.auditService.log({
      action: 'NOTIFICATION_TEMPLATE_DELETED',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'NOTIFICATION_TEMPLATE',
      entityId: templateId,
      tenantId: existing.tenantId,
      before: {
        templateCode: existing.templateCode,
        channel: existing.channel,
        isActive: existing.active,
      },
      after: null,
    });
  }
}
