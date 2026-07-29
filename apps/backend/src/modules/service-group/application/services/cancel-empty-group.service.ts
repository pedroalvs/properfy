import { isTerminalAppointmentStatus } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

const CANCEL_REASON = 'Group has no remaining appointments to execute';

/** Released groups only. DRAFT is the repair state operators republish into. */
const CANCELLABLE_STATUSES = new Set(['PUBLISHED', 'ACCEPTED']);

/**
 * Cancels a released service group once nothing is left in it to execute.
 *
 * "Nothing left" means no live members **and** no `DONE` members. The `DONE` part
 * matters: `DONE` is a terminal status, so a group whose inspections all succeeded
 * would otherwise look identical to one whose appointments were all cancelled.
 * There is no `COMPLETED` group status — a finished group rests at `ACCEPTED`.
 *
 * Used from three places: the appointment-transition subscriber, the portal
 * group-change flow, and the daily sweep.
 */
export class CancelEmptyGroupService {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
    private readonly eventBus?: DomainEventBus,
  ) {}

  /** @returns true when this call cancelled the group. */
  async cancelIfDead(groupId: string): Promise<boolean> {
    // Groups are tenant-agnostic; tenant_id is derived from their members.
    const result = await this.serviceGroupRepo.findById(groupId, null);
    if (!result) return false;

    const { group, primaryTenantId, appointments } = result;

    if (!CANCELLABLE_STATUSES.has(group.status)) return false;

    // findById already filters soft-deleted appointments out, so a group whose only
    // member was deleted correctly reads as empty here.
    const hasLiveMember = appointments.some((a) => !isTerminalAppointmentStatus(a.status));
    if (hasLiveMember) return false;

    const hasDoneMember = appointments.some((a) => a.status === 'DONE');
    if (hasDoneMember) return false;

    const previousStatus = group.status;

    await this.serviceGroupRepo.update(groupId, { status: 'CANCELLED' });

    // Deliberately no unlinkAppointments: every member is terminal, so nothing
    // needs re-grouping, and clearing service_group_id would erase which group the
    // cancelled work belonged to. Deliberately no revertScheduledAppointments
    // either: a group with no live members has no SCHEDULED member to revert.

    this.auditService.log({
      action: 'service_group.cancelled',
      actorType: 'SYSTEM',
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: previousStatus },
      after: { status: 'CANCELLED' },
      reason: CANCEL_REASON,
      metadata: { trigger: 'empty_group_cleanup', memberCount: appointments.length },
    });

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.CANCELLED,
      payload: { groupId, tenantId: primaryTenantId },
      occurredAt: new Date(),
    }).catch(() => {
      // fire-and-forget — a subscriber failure must not undo the cancellation
    });

    this.logger.info(
      { groupId, previousStatus, memberCount: appointments.length },
      'Cancelled service group with no remaining appointments',
    );

    return true;
  }
}
