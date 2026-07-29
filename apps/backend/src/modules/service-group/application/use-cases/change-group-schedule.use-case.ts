import type { AuthContext, GroupConfirmationStrategy } from '@properfy/shared';
import { validateEditedSchedule, PLATFORM_TIMEZONE, isTerminalAppointmentStatus } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  ServiceGroupDateInPastError,
  ServiceGroupTimeInPastError,
} from '../../domain/service-group.errors';
import {
  syncAppointmentScheduleToGroup,
  type ServiceGroupTimeSyncLogger,
} from '../sync-appointment-time-slot-to-group';
import { getServiceGroupDateAdjustment } from '../../domain/service-group-date-sync';
import { getServiceGroupTimeSlotAdjustment } from '../../domain/service-group-time-slot-sync';
import type { SendGroupPortalLinksUseCase } from './send-group-portal-links.use-case';

/** A closed group's schedule is history; only a live one can still move. */
const CHANGEABLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ACCEPTED'];

/**
 * Long enough that a double-submit or a retried request replays instead of
 * rotating confirmation cycles twice, short enough that a deliberate re-apply
 * of the same schedule later in the shift still runs.
 */
const IDEMPOTENCY_TTL_HOURS = 2;

const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

interface AdminRescheduleNotifier {
  execute(input: { appointmentId: string; tenantId: string }): Promise<void>;
}

export interface ChangeGroupScheduleInput {
  groupId: string;
  scheduledDate?: string;
  timeWindow?: string;
  confirmationStrategy: GroupConfirmationStrategy;
  actor: AuthContext;
  idempotencyKey?: string;
}

export interface ChangeGroupScheduleOutput {
  id: string;
  status: string;
  scheduledDate: string;
  timeWindow: string;
  applied: {
    total: number;
    dateChanged: number;
    slotClamped: number;
    failed: number;
    confirmationsHandled: number;
    confirmationStrategy: GroupConfirmationStrategy;
  };
}

/**
 * Moves a live group's date and/or time window, cascading to its members.
 *
 * Members follow the group: the date is replaced outright, and a slot that falls
 * outside a changed window is clamped into it. The mirror of PR #997, where
 * editing one member's time widens the group's window to fit — there the member
 * is the thing the operator framed, here it is the group. Whichever the operator
 * named wins; both resolve the same containment rule.
 *
 * Changing the date alone deliberately leaves every slot untouched, which is why
 * the window is only handed to the cascade when it actually changed.
 */
export class ChangeGroupScheduleUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly sendGroupPortalLinks: SendGroupPortalLinksUseCase,
    private readonly confirmationCycleService: ConfirmationCycleService,
    private readonly onAdminRescheduleHandler: AdminRescheduleNotifier,
    private readonly eventBus?: DomainEventBus,
    private readonly logger: ServiceGroupTimeSyncLogger = { error: () => undefined },
  ) {}

  async execute(input: ChangeGroupScheduleInput): Promise<ChangeGroupScheduleOutput> {
    const { actor, groupId, confirmationStrategy } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'service_group.manage',
      entityType: 'ServiceGroup',
    });

    const findResult = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!findResult) {
      throw new ServiceGroupNotFoundError();
    }
    const { group, primaryTenantId } = findResult;

    if (!CHANGEABLE_STATUSES.includes(group.status)) {
      throw new ServiceGroupInvalidStatusError('DRAFT, PUBLISHED or ACCEPTED', group.status);
    }

    const previousScheduledDate = toDateString(group.scheduledDate);
    const previousTimeWindow = group.timeWindow;

    // Everything is validated before the first write. PR #997's follow-up fix
    // (a6437681) is the cautionary tale: a group write inside the validation
    // block survived a later rejection and left the window permanently moved
    // for an edit that never landed.
    const scheduleCheck = validateEditedSchedule({
      existingDate: previousScheduledDate,
      existingTimeSlot: previousTimeWindow,
      newDate: input.scheduledDate,
      newTimeSlot: input.timeWindow,
      tz: PLATFORM_TIMEZONE,
    });
    if (!scheduleCheck.ok) {
      throw scheduleCheck.code === 'TIME_IN_PAST'
        ? new ServiceGroupTimeInPastError()
        : new ServiceGroupDateInPastError();
    }

    const dateChanged = input.scheduledDate !== undefined && input.scheduledDate !== previousScheduledDate;
    const windowChanged = input.timeWindow !== undefined && input.timeWindow !== previousTimeWindow;
    const effectiveDate = input.scheduledDate ?? previousScheduledDate;
    const effectiveWindow = input.timeWindow ?? previousTimeWindow;

    // Keyed on the payload, not just the group: a second, different change must
    // still run, but a double-submit of the same one must not. This is
    // load-bearing for RESEND, whose portal-link path rotates confirmation
    // cycles and would otherwise do so twice.
    const idempotencyKey =
      input.idempotencyKey ?? `group-schedule:${groupId}:${effectiveDate}:${effectiveWindow}:${confirmationStrategy}`;
    const cached = await this.idempotencyService.get<ChangeGroupScheduleOutput>(idempotencyKey, 'group-schedule');
    if (cached) return cached;

    const groupScheduledDate = new Date(effectiveDate);

    await this.serviceGroupRepo.update(groupId, {
      ...(dateChanged ? { scheduledDate: groupScheduledDate } : {}),
      ...(windowChanged ? { timeWindow: effectiveWindow } : {}),
    });

    let movedDate = 0;
    let clampedSlot = 0;
    let failed = 0;
    const movedMembers: Array<{ id: string; tenantId: string; timeSlot: string }> = [];

    for (const member of findResult.appointments) {
      // An accepted group can hold completed members; moving them would rewrite
      // a record rather than plan work.
      if (isTerminalAppointmentStatus(member.status)) continue;

      const memberDateMoves = dateChanged
        ? getServiceGroupDateAdjustment(member.scheduledDate, groupScheduledDate) !== null
        : false;
      const slotAdjustment = windowChanged
        ? getServiceGroupTimeSlotAdjustment(member, effectiveWindow)
        : null;

      if (!memberDateMoves && !slotAdjustment) continue;

      try {
        await syncAppointmentScheduleToGroup({
          appointmentRepo: this.appointmentRepo,
          auditService: this.auditService,
          appointment: member,
          // Only when the window moved — see the class comment.
          ...(windowChanged ? { groupTimeWindow: effectiveWindow } : {}),
          groupScheduledDate,
          groupId,
          actor,
          logger: this.logger,
          reason: 'Service group schedule changed',
        });
      } catch (err) {
        // The group row is already committed; one member failing must not make
        // the whole change look rejected. Counted so the operator sees it.
        failed += 1;
        this.logger.error(
          { err, appointmentId: member.id, tenantId: member.tenantId, groupId },
          'appointment schedule sync to group failed',
        );
        continue;
      }

      if (memberDateMoves) movedDate += 1;
      if (slotAdjustment) clampedSlot += 1;
      movedMembers.push({
        id: member.id,
        tenantId: member.tenantId,
        timeSlot: slotAdjustment
          ? `${slotAdjustment.timeSlotStart}-${slotAdjustment.timeSlotEnd}`
          : `${member.timeSlotStart}-${member.timeSlotEnd}`,
      });
    }

    // "Was this tenant already told about the OLD schedule?" — the same gate
    // PR #997 settled on for admin reschedules. A never-released member has
    // neither a confirmation nor an open cycle, so it stays silent.
    const needsConfirmationHandling = movedMembers.filter((moved) => {
      const member = findResult.appointments.find((a) => a.id === moved.id)!;
      return (
        member.status === 'SCHEDULED' ||
        member.rentalTenantConfirmationStatus === 'CONFIRMED' ||
        !!member.activeConfirmationCycleId
      );
    });

    if (needsConfirmationHandling.length > 0) {
      if (confirmationStrategy === 'RESEND') {
        // Scoped to the affected members: the rest of the group kept its
        // schedule and must not be mailed. Best-effort for the same reason as
        // NOTIFY_ONLY below — the schedule is already written, so a dispatch
        // failure must not report the whole change as rejected.
        try {
          await this.sendGroupPortalLinks.execute({
            groupId,
            actor,
            appointmentIds: needsConfirmationHandling.map((m) => m.id),
          });
        } catch (err) {
          this.logger.error(
            { err, groupId, appointmentIds: needsConfirmationHandling.map((m) => m.id) },
            'group portal link resend after schedule change failed',
          );
        }
      } else {
        for (const moved of needsConfirmationHandling) {
          // Best-effort: a mail failure must not fail a change already written.
          try {
            await this.confirmationCycleService.realignActiveCycleSchedule(
              moved.id,
              moved.tenantId,
              groupScheduledDate,
              moved.timeSlot,
            );
            await this.onAdminRescheduleHandler.execute({
              appointmentId: moved.id,
              tenantId: moved.tenantId,
            });
          } catch (err) {
            this.logger.error(
              { err, appointmentId: moved.id, groupId },
              'rental tenant reschedule notice failed',
            );
          }
        }
      }
    }

    this.auditService.log({
      action: 'service_group.schedule_changed',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { scheduledDate: previousScheduledDate, timeWindow: previousTimeWindow },
      after: { scheduledDate: effectiveDate, timeWindow: effectiveWindow },
      metadata: {
        confirmationStrategy,
        initiatedBy: actor.role,
        groupStatus: group.status,
        dateChanged: movedDate,
        slotClamped: clampedSlot,
        failed,
        confirmationsHandled: needsConfirmationHandling.length,
      },
    });

    const result: ChangeGroupScheduleOutput = {
      id: groupId,
      status: group.status,
      scheduledDate: effectiveDate,
      timeWindow: effectiveWindow,
      applied: {
        total: findResult.appointments.length,
        dateChanged: movedDate,
        slotClamped: clampedSlot,
        failed,
        confirmationsHandled: needsConfirmationHandling.length,
        confirmationStrategy,
      },
    };

    await this.idempotencyService.set(idempotencyKey, 'group-schedule', result, IDEMPOTENCY_TTL_HOURS);

    this.eventBus?.emit({
      type: SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED,
      payload: {
        groupId,
        tenantId: primaryTenantId,
        inspectorId: group.assignedInspectorId,
        previousScheduledDate,
        previousTimeWindow,
        scheduledDate: effectiveDate,
        timeWindow: effectiveWindow,
      },
      occurredAt: new Date(),
    });

    return result;
  }
}
