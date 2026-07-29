import { isTerminalAppointmentStatus } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

const CANCEL_REASON = 'Group has no remaining appointments to execute';

/**
 * Released groups only. DRAFT is the repair state operators republish into, and
 * terminal groups are already settled.
 *
 * Single definition: the empty-group sweep imports this rather than restating it.
 */
export const CANCELLABLE_GROUP_STATUSES = ['PUBLISHED', 'ACCEPTED'] as const;

const CANCELLABLE_STATUSES: ReadonlySet<string> = new Set(CANCELLABLE_GROUP_STATUSES);

/**
 * Whether a group has nothing left to execute, judged purely from its members.
 *
 * "Nothing left" needs both halves: no live member, AND no `DONE` member. `DONE` is
 * a terminal status, so the live check alone would also match a group whose
 * inspections all *succeeded* — and there is no `COMPLETED` group status to
 * distinguish them, so a finished group legitimately rests at `ACCEPTED`.
 *
 * Exported so the dry-run report classifies groups with this exact rule instead of
 * restating it — a second copy would silently drift from the real behaviour.
 * Callers must pass members already filtered to `deleted_at IS NULL`.
 */
export function isServiceGroupDead(members: ReadonlyArray<{ status: string }>): boolean {
  if (members.some((m) => !isTerminalAppointmentStatus(m.status))) return false;
  return !members.some((m) => m.status === 'DONE');
}

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
    if (!isServiceGroupDead(appointments)) return false;

    const previousStatus = group.status;

    // Optimistic claim on the status we just read. Bulk-cancelling a group's members
    // fires one transition event each and the subscriber runs fire-and-forget, so
    // several calls can reach here concurrently for the same group. Without this
    // guard every one of them would write, audit and emit — duplicate audit rows and
    // duplicate domain events for a single cancellation. Mirrors `acceptOptimistic`.
    const claimed = await this.serviceGroupRepo.cancelOptimistic(groupId, previousStatus);
    if (claimed === 0) return false;

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
