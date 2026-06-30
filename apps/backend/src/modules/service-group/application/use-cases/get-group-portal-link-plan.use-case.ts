import type { AuthContext, GetGroupPortalLinkPlanResponse } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { classifyPortalLinkAction } from '../../../appointment/domain/portal-link-eligibility';

export interface GetGroupPortalLinkPlanInput {
  groupId: string;
  actor: AuthContext;
}

/**
 * Read-only preview for the group "Send portal link" confirm dialog.
 *
 * Loads the group's appointments with their confirmation state and runs the
 * shared `classifyPortalLinkAction` resolver per appointment, returning the
 * planned action and a summary count breakdown. No writes, no idempotency,
 * no audit — the executing path is `SendGroupPortalLinksUseCase`, which uses
 * the same resolver so the preview and the send always agree.
 */
export class GetGroupPortalLinkPlanUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetGroupPortalLinkPlanInput): Promise<GetGroupPortalLinkPlanResponse> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'service_group.send_portal_links',
      entityType: 'ServiceGroup',
      entityId: input.groupId,
    });

    const groupTenantScope = input.actor.role === 'AM' ? null : input.actor.tenantId;
    const found = await this.groupRepo.findById(input.groupId, groupTenantScope);
    if (!found) {
      throw new NotFoundError('SERVICE_GROUP_NOT_FOUND', `Service group ${input.groupId} not found`);
    }

    const rows = await this.groupRepo.findGroupAppointmentsWithConfirmation(input.groupId);
    // OP is tenant-scoped: only act on appointments belonging to their tenant.
    // AM is cross-tenant. Keeps the preview counts honest with what the send does.
    const inScope = input.actor.role === 'AM' ? rows : rows.filter((r) => r.tenantId === input.actor.tenantId);

    const items = inScope.map((r) => ({
      appointmentId: r.id,
      appointmentNumber: r.appointmentNumber,
      propertyCode: r.propertyCode,
      plannedAction: classifyPortalLinkAction(r),
    }));

    const summary = {
      total: items.length,
      willSend: items.filter((i) => i.plannedAction === 'SEND').length,
      willResendDateChanged: items.filter((i) => i.plannedAction === 'SEND_AFTER_RESET').length,
      alreadyConfirmed: items.filter((i) => i.plannedAction === 'SKIP_ALREADY_CONFIRMED').length,
      notSendable: items.filter((i) => i.plannedAction === 'SKIP_NOT_SENDABLE').length,
    };

    return { items, summary };
  }
}
