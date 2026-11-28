import type { AuthContext } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { InspectorEntity } from '../../../inspector/domain/inspector.entity';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { ConfirmationCycleService } from '../../../appointment/application/services/confirmation-cycle.service';
import type { CancelEmptyGroupService } from '../services/cancel-empty-group.service';
import { NotFoundError } from '../../../../shared/domain/errors';
import { ServiceGroupValidator, type MoveToGroupReason } from '../../domain/service-group.validator';
import { assertInspectorEligibleForGroup } from '../assert-inspector-eligible-for-group';
import { trySyncAppointmentScheduleToGroup, type ServiceGroupTimeSyncLogger } from '../sync-appointment-time-slot-to-group';
import { type DomainEventBus, SERVICE_GROUP_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { moveTargetLowerBoundDate, isCurrentDayGroup } from '../../domain/group-move-eligibility';

export type MoveToGroupResultStatus =
  | 'OK'
  | MoveToGroupReason
  | 'TARGET_DATE_INELIGIBLE'
  | 'NOT_FOUND'
  | 'ERROR';

export interface MoveToGroupResultItem {
  appointmentId: string;
  status: MoveToGroupResultStatus;
  error?: { code: string; message: string };
}

export interface MoveAppointmentsToGroupInput {
  /** The destination group. */
  groupId: string;
  appointmentIds: string[];
  actor: AuthContext;
  idempotencyKey?: string;
}

export interface MoveAppointmentsToGroupOutput {
  results: MoveToGroupResultItem[];
  movedCount: number;
}

const IDEMPOTENCY_SCOPE = 'group-move';
const IDEMPOTENCY_TTL_HOURS = 2;

/**
 * Move appointments that are ALREADY in a live group to a different active group.
 *
 * Per-item, inside the repository's atomic transaction: unlink from the source and
 * relink to the target, reconciling status (AWAITING_INSPECTOR for a DRAFT/PUBLISHED
 * target, SCHEDULED under the committed inspector for an ACCEPTED target) and the
 * source/target `confirmed_count`. The member's date/time is then synced to the
 * target ("data manda").
 *
 * When the destination is scheduled for the CURRENT Sydney day, the rental tenant is
 * force-confirmed on their behalf BEFORE the move — the same ordering guarantee as
 * `ChangeGroupScheduleUseCase`'s FORCE_CONFIRM, so a confirm failure aborts that
 * appointment's move and no "moved but unconfirmed" job (which the 19:00 T-1 sweep
 * would auto-cancel) can persist.
 *
 * Per-item failures land in a mixed-result envelope so one bad appointment never
 * aborts the batch.
 */
export class MoveAppointmentsToGroupUseCase {
  constructor(
    private readonly groupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly confirmationCycleService: ConfirmationCycleService,
    private readonly cancelEmptyGroupService: CancelEmptyGroupService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly eventBus: DomainEventBus,
    private readonly logger: ServiceGroupTimeSyncLogger = { error: () => undefined },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: MoveAppointmentsToGroupInput): Promise<MoveAppointmentsToGroupOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'appointment.move_to_group',
      entityType: 'ServiceGroup',
      entityId: input.groupId,
    });

    const idempotencyKey =
      input.idempotencyKey ?? `group-move:${input.groupId}:${[...input.appointmentIds].sort().join(',')}`;
    const cached = await this.idempotencyService.get<MoveAppointmentsToGroupOutput>(idempotencyKey, IDEMPOTENCY_SCOPE);
    if (cached) return cached;

    // Groups are tenant-agnostic and both AM and OP are cross-tenant here.
    const found = await this.groupRepo.findById(input.groupId, null);
    if (!found) {
      throw new NotFoundError('SERVICE_GROUP_NOT_FOUND', `Service group ${input.groupId} not found`);
    }
    const { group } = found;
    let currentSize = found.appointments.length;

    const now = this.clock();

    // Fail the whole batch cleanly (per-item) if the TARGET itself cannot receive a
    // move: terminal, or scheduled past / today-after-cutoff (a stale picker).
    let targetBlock: MoveToGroupResultStatus | null = null;
    if (!ServiceGroupValidator.isAddableStatus(group.status as never)) {
      targetBlock = 'GROUP_IN_TERMINAL_STATE';
    } else {
      const targetCivil = civilDateInTimezone(group.scheduledDate, PLATFORM_TIMEZONE);
      if (targetCivil < moveTargetLowerBoundDate(now, PLATFORM_TIMEZONE)) {
        targetBlock = 'TARGET_DATE_INELIGIBLE';
      }
    }

    const targetAccepted = group.status === 'ACCEPTED' && !!group.assignedInspectorId;
    const acceptedInspector: InspectorEntity | null = targetAccepted
      ? await this.inspectorRepo.findById(group.assignedInspectorId!)
      : null;
    const targetIsCurrentDay = isCurrentDayGroup(group.scheduledDate, now, PLATFORM_TIMEZONE);

    const results: MoveToGroupResultItem[] = [];
    const scheduledUnderInspector: string[] = [];
    const sourceGroupIds = new Set<string>();

    for (const apptId of input.appointmentIds) {
      const foundAppt = await this.appointmentRepo.findById(apptId, null);
      if (!foundAppt) {
        results.push({ appointmentId: apptId, status: 'NOT_FOUND', error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
        continue;
      }
      const { appointment } = foundAppt;

      if (targetBlock) {
        results.push({ appointmentId: apptId, status: targetBlock, error: { code: targetBlock, message: reasonMessage(targetBlock) } });
        continue;
      }

      const sourceStatus = appointment.serviceGroupId
        ? await this.groupRepo.findStatusById(appointment.serviceGroupId)
        : null;

      const validation = ServiceGroupValidator.canMoveToGroup(
        {
          id: appointment.id,
          appointmentNumber: appointment.appointmentNumber,
          status: appointment.status,
          serviceTypeId: appointment.serviceTypeId,
          tenantId: appointment.tenantId,
          serviceGroupId: appointment.serviceGroupId,
        },
        { status: group.status, serviceTypeId: group.serviceTypeId, currentSize },
        input.groupId,
        sourceStatus,
      );
      if (!validation.ok) {
        results.push({ appointmentId: apptId, status: validation.reasonCode, error: { code: validation.reasonCode, message: reasonMessage(validation.reasonCode) } });
        continue;
      }

      // ACCEPTED target: the member is scheduled under the committed inspector, so
      // gate on the same eligibility accept/assign enforce.
      if (targetAccepted) {
        const eligible = await this.isInspectorEligible(acceptedInspector, group.serviceTypeId, appointment);
        if (!eligible) {
          results.push({ appointmentId: apptId, status: 'INSPECTOR_INELIGIBLE', error: { code: 'INSPECTOR_INELIGIBLE', message: reasonMessage('INSPECTOR_INELIGIBLE') } });
          continue;
        }
      }

      const fromGroupId = appointment.serviceGroupId!;
      const previousStatus = appointment.status;

      try {
        // Current-day destination → confirm on the tenant's behalf BEFORE the move,
        // so a confirm failure aborts the move (no moved-but-unconfirmed limbo).
        if (targetIsCurrentDay) {
          try {
            await this.confirmationCycleService.confirm(apptId, appointment.tenantId, 'OPERATOR_FORCED', null);
            this.auditService.log({
              action: 'appointment.force_manual_confirmation',
              actorType: 'USER',
              actorId: input.actor.userId,
              entityType: 'Appointment',
              entityId: apptId,
              tenantId: appointment.tenantId,
              metadata: { trigger: 'group_move_current_day', groupId: input.groupId },
            });
          } catch (err) {
            this.logger.error({ err, appointmentId: apptId, groupId: input.groupId }, 'force-confirm before group move failed');
            results.push({ appointmentId: apptId, status: 'ERROR', error: { code: 'FORCE_CONFIRM_FAILED', message: 'Could not confirm the tenant before moving; nothing was moved' } });
            continue;
          }
        }

        const outcome = await this.groupRepo.moveAppointmentBetweenGroups({
          appointmentId: apptId,
          fromGroupId,
          toGroupId: input.groupId,
          expectedTargetInspectorId: targetAccepted ? group.assignedInspectorId! : null,
        });

        if (outcome === 'GROUP_CHANGED') {
          results.push({ appointmentId: apptId, status: 'ERROR', error: { code: 'GROUP_STATE_CHANGED', message: 'Target group changed before the move; please retry' } });
          continue;
        }
        if (outcome === 'APPOINTMENT_CONFLICT') {
          results.push({ appointmentId: apptId, status: 'ERROR', error: { code: 'APPOINTMENT_STATE_CHANGED', message: 'Appointment changed before it could be moved; please retry' } });
          continue;
        }

        currentSize += 1;
        sourceGroupIds.add(fromGroupId);
        const finalStatus = outcome === 'MOVED_SCHEDULED' ? 'SCHEDULED' : 'AWAITING_INSPECTOR';

        // Align the member's date/time with the target (best-effort; the relink is
        // already committed, so a sync failure only leaves date/time unaligned).
        await trySyncAppointmentScheduleToGroup({
          appointmentRepo: this.appointmentRepo,
          auditService: this.auditService,
          appointment,
          groupTimeWindow: group.timeWindow,
          groupScheduledDate: group.scheduledDate,
          groupId: input.groupId,
          actor: input.actor,
          logger: this.logger,
        });

        this.auditService.log({
          action: 'appointment.moved_between_groups',
          actorType: 'USER',
          actorId: input.actor.userId,
          entityType: 'Appointment',
          entityId: apptId,
          tenantId: appointment.tenantId,
          metadata: { fromGroupId, toGroupId: input.groupId, previousStatus, newStatus: finalStatus },
        });

        // A move can change the member's status; audit only legal state-machine edges.
        this.auditMoveTransition(apptId, appointment.tenantId, previousStatus, finalStatus, group.assignedInspectorId, input);

        if (finalStatus === 'SCHEDULED') scheduledUnderInspector.push(apptId);
        results.push({ appointmentId: apptId, status: 'OK' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
        results.push({ appointmentId: apptId, status: 'ERROR', error: { code, message } });
      }
    }

    // A source group that lost its last live member is dead; cancel it (best-effort).
    for (const sourceId of sourceGroupIds) {
      try {
        await this.cancelEmptyGroupService.cancelIfDead(sourceId);
      } catch (err) {
        this.logger.error({ err, groupId: sourceId }, 'cancel-empty source group after move failed');
      }
    }

    // One event for the members newly scheduled under the target's inspector — the
    // tenant subscriber notifies only those appointments, the inspector subscriber
    // tells the committed inspector their schedule grew. Reuses the add-to-group path.
    if (scheduledUnderInspector.length > 0 && group.assignedInspectorId) {
      await this.eventBus.emit({
        type: SERVICE_GROUP_EVENTS.MEMBERS_ADDED,
        payload: {
          groupId: input.groupId,
          inspectorId: group.assignedInspectorId,
          appointmentIds: scheduledUnderInspector,
        },
        occurredAt: new Date(),
      });
    }

    const result: MoveAppointmentsToGroupOutput = {
      results,
      movedCount: results.filter((r) => r.status === 'OK').length,
    };
    await this.idempotencyService.set(idempotencyKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
    return result;
  }

  /**
   * Audit a move's status change as the legal state-machine edges only — never a
   * direct illegal hop. Reaching SCHEDULED from a DRAFT/REJECTED member (moving into
   * an ACCEPTED group) is recorded as the two legal hops the state machine defines
   * (revival → AWAITING_INSPECTOR, then acceptance → SCHEDULED), exactly like
   * `AddAppointmentsToGroupUseCase.auditAcceptedGroupSchedule`; the revival hop from
   * REJECTED is an OP/AM (USER) action, from DRAFT a SYSTEM one. A SCHEDULED member
   * leaving an ACCEPTED group for a DRAFT/PUBLISHED one reverts on the single legal
   * `SCHEDULED → AWAITING_INSPECTOR` edge. No status change (AWAITING↔AWAITING or
   * SCHEDULED↔SCHEDULED) writes no transition audit.
   */
  private auditMoveTransition(
    appointmentId: string,
    tenantId: string,
    previousStatus: string,
    finalStatus: string,
    inspectorId: string | null,
    input: MoveAppointmentsToGroupInput,
  ): void {
    if (finalStatus === previousStatus) return;
    const base = {
      action: 'appointment.status_transition' as const,
      actorId: input.actor.userId,
      entityType: 'Appointment' as const,
      entityId: appointmentId,
      tenantId,
      reason: `Moved to service group ${input.groupId}`,
    };

    if (finalStatus === 'SCHEDULED') {
      // Hop 1 — revival to AWAITING_INSPECTOR (only DRAFT/REJECTED members need it).
      if (previousStatus === 'DRAFT') {
        this.auditService.log({
          ...base,
          actorType: 'SYSTEM',
          before: { status: 'DRAFT' },
          after: { status: 'AWAITING_INSPECTOR' },
          metadata: { systemTriggered: true, groupId: input.groupId, previousStatus: 'DRAFT' },
        });
      } else if (previousStatus === 'REJECTED') {
        this.auditService.log({
          ...base,
          actorType: 'USER',
          before: { status: 'REJECTED' },
          after: { status: 'AWAITING_INSPECTOR' },
          metadata: { systemTriggered: false, groupId: input.groupId, previousStatus: 'REJECTED' },
        });
      }
      // Hop 2 — acceptance under the target group's committed inspector.
      this.auditService.log({
        ...base,
        actorType: 'SYSTEM',
        before: { status: 'AWAITING_INSPECTOR' },
        after: { status: 'SCHEDULED' },
        metadata: {
          systemTriggered: true,
          groupId: input.groupId,
          previousStatus: 'AWAITING_INSPECTOR',
          assignedInspectorId: inspectorId,
        },
      });
      return;
    }

    // SCHEDULED → AWAITING_INSPECTOR (a SCHEDULED member leaving an ACCEPTED source for
    // a DRAFT/PUBLISHED target) — a single legal edge, operator-initiated.
    this.auditService.log({
      ...base,
      actorType: 'USER',
      before: { status: previousStatus },
      after: { status: finalStatus },
      metadata: { groupId: input.groupId, previousStatus },
    });
  }

  private async isInspectorEligible(
    inspector: InspectorEntity | null,
    serviceTypeId: string,
    appointment: { tenantId: string; propertyId: string },
  ): Promise<boolean> {
    if (!inspector) return false;
    try {
      await assertInspectorEligibleForGroup({
        inspector,
        serviceTypeId,
        tenantIds: [appointment.tenantId],
        propertyIds: [appointment.propertyId],
        serviceRegionRepo: this.serviceRegionRepo,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function reasonMessage(code: MoveToGroupResultStatus): string {
  switch (code) {
    case 'NOT_GROUPED': return 'Appointment is not in a group — use "Add to group" instead';
    case 'SOURCE_GROUP_NOT_ACTIVE': return 'The appointment\'s current group is no longer active';
    case 'ALREADY_IN_TARGET': return 'Appointment is already in the selected group';
    case 'INVALID_STATUS': return 'Appointment is in a status that cannot be moved';
    case 'INVALID_SERVICE_TYPE': return 'Appointment service type does not match the group';
    case 'GROUP_IN_TERMINAL_STATE': return 'The destination group cannot accept new appointments';
    case 'GROUP_CAPACITY_EXCEEDED': return 'The destination group has reached its capacity of 30 appointments';
    case 'INSPECTOR_INELIGIBLE': return 'The destination group\'s inspector is not eligible for this appointment\'s agency or region';
    case 'TARGET_DATE_INELIGIBLE': return 'The destination group\'s date is no longer available for moves';
    default: return 'Appointment could not be moved';
  }
}
