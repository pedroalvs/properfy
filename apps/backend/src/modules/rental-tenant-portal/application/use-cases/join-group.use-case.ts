import { SYSTEM_ACTOR } from '../../../../shared/domain/constants';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ExecuteStatusTransitionInput, ExecuteStatusTransitionOutput } from '../../../appointment/application/use-cases/execute-status-transition.use-case';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import type { AppointmentEntity } from '../../../appointment/domain/appointment.entity';
import type { ServiceGroupEntity } from '../../../service-group/domain/service-group.entity';
import { computeWindowAvailability } from '../../../service-group/domain/portal-slot-capacity';
import { isPortalDeadStatus } from '../../domain/portal-statuses';
import { ConfirmationCycleNotFoundError } from '../../../appointment/domain/confirmation-cycle.errors';
import type { Logger } from '../../../../shared/infrastructure/logger';
import {
  PortalAppointmentInactiveError,
  PortalTokenAlreadyUsedError,
  PortalGroupNotFoundError,
  PortalGroupFullError,
  PortalGroupUnavailableError,
  PortalGroupSlotUnavailableError,
} from '../../domain/rental-tenant-portal.errors';

interface IStatusTransitionUseCase {
  execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput>;
}

interface INotificationHandler {
  execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown>;
}

interface ICancelEmptyGroupService {
  cancelIfDead(groupId: string): Promise<boolean>;
}

export interface JoinGroupInput {
  tokenId: string;
  appointmentId: string;
  groupId: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  isUsed: boolean;
  rentalTenantNote?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface JoinGroupOutput {
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  rentalTenantConfirmationStatus: 'CONFIRMED';
  appointmentStatus: 'SCHEDULED';
  inspector: { id: string; name: string };
}

interface IConfirmationCycleService {
  realignActiveCycleSchedule(
    appointmentId: string,
    tenantId: string,
    newDate: Date,
    newTimeSlot: string | null,
  ): Promise<void>;
  confirm(
    appointmentId: string,
    tenantId: string,
    source: 'RENTAL_TENANT_PORTAL' | 'OPERATOR_FORCED',
    tokenId: string | null,
  ): Promise<unknown>;
}

const ACTIVE_GROUP_STATUSES = new Set(['ACCEPTED']);

/** Reason for the recovery hop out of REJECTED; the rule requires one for every actor. */
const REJOIN_RECOVERY_REASON = 'Rental tenant chose another available time via the portal';

export class JoinGroupUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly auditService: AuditService,
    private readonly statusTransition: IStatusTransitionUseCase,
    private readonly onNotificationHandler?: INotificationHandler,
    /** Optional: cancels the group the tenant left when it ends up with nothing to execute. */
    private readonly cancelEmptyGroup?: ICancelEmptyGroupService,
    /** Optional: keeps the confirmation cycle in step with the slot just taken. */
    private readonly cycleService?: IConfirmationCycleService,
    private readonly logger?: Logger,
  ) {}

  /**
   * Tenant joins an available service group via the portal.
   * Implements the 13-step side-effect sequence from spec §5.2.
   */
  async execute(input: JoinGroupInput): Promise<JoinGroupOutput> {
    // 1-2. Token expiry does not block a group change: the tenant may still pick
    // another slot after the scheduled day, as long as the appointment is live.
    //
    // A prior `used_at` does not block it either. Reporting unavailability hands
    // the claim back precisely so the tenant can still change time afterwards,
    // and the conditional `tryClaim` below is the authoritative replay guard —
    // the `isUsed` flag read by the middleware is already stale by this point.

    // Load appointment
    const apptResult = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!apptResult) throw new PortalGroupNotFoundError();
    const { appointment } = apptResult;

    if (isPortalDeadStatus(appointment.status)) {
      throw new PortalAppointmentInactiveError();
    }

    // 3. Validate group
    const groupResult = await this.serviceGroupRepo.findById(input.groupId, null);
    if (!groupResult) throw new PortalGroupNotFoundError();

    const { group, assignedInspectorName, tenantIds } = groupResult;

    // Tenant isolation: the appointment's agency must be one of the agencies
    // present in the group (groups may now span multiple agencies).
    if (!tenantIds.includes(appointment.tenantId) || group.serviceTypeId !== appointment.serviceTypeId) {
      throw new PortalGroupNotFoundError();
    }
    if (!ACTIVE_GROUP_STATUSES.has(group.status)) {
      throw new PortalGroupUnavailableError();
    }
    if (!group.assignedInspectorId || !assignedInspectorName) {
      throw new PortalGroupUnavailableError();
    }
    if (!appointment.propertyId || !appointment.serviceTypeId) {
      throw new PortalGroupSlotUnavailableError();
    }
    // The appointment's own group is never a valid change-time target.
    if (appointment.serviceGroupId === group.id) {
      throw new PortalGroupSlotUnavailableError();
    }

    const now = new Date();
    const members = await this.serviceGroupRepo.findPortalEligibleSlots({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today: now,
      excludeGroupId: appointment.serviceGroupId,
    });

    const selectedWindow = { timeSlotStart: input.timeSlotStart, timeSlotEnd: input.timeSlotEnd };
    const groupDayMembers = members.filter((member) => (
      member.groupId === group.id &&
      member.scheduledDate.toISOString().slice(0, 10) === input.scheduledDate
    ));
    const isOfferedWindow = groupDayMembers.some((member) => (
      member.isOwnAgency &&
      member.timeSlotStart === selectedWindow.timeSlotStart &&
      member.timeSlotEnd === selectedWindow.timeSlotEnd
    ));
    if (!isOfferedWindow) {
      throw new PortalGroupSlotUnavailableError();
    }

    // Re-run the 2-inspections-per-hour rule server-side: the numbers the picker
    // rendered can be stale by the time the tenant taps through.
    if (computeWindowAvailability(groupDayMembers, selectedWindow).remaining <= 0) {
      throw new PortalGroupFullError();
    }

    const hasSelectedSlot = await this.serviceGroupRepo.hasPortalMemberSlot({
      groupId: group.id,
      scheduledDate: input.scheduledDate,
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      today: now,
    });
    if (!hasSelectedSlot) {
      throw new PortalGroupSlotUnavailableError();
    }

    // Atomically claim the token before the first side effect. The
    // conditional write is the real replay guard — the isUsed fast-path above
    // is stale under concurrency, so two racing requests must resolve here.
    const claimed = await this.tokenRepo.tryClaim(input.tokenId, input.appointmentId);
    if (!claimed) {
      throw new PortalTokenAlreadyUsedError();
    }

    // Re-read the status now that the claim is held. Everything above validated
    // against a read taken before it, and a decline can land in between: it
    // rejects the appointment and then deliberately hands the token back, so it
    // does not collide on the claim. Deciding the hops below on the stale value
    // would skip them entirely and leave a REJECTED appointment sitting in a live
    // group — silently, because `reservePortalWindow` now admits REJECTED rows.
    // Both gates that used to make this race fail closed were opened on purpose
    // by the auto-reject work, so this read is what replaces them.
    const freshResult = await this.appointmentRepo.findById(input.appointmentId, null);
    const freshAppointment = freshResult?.appointment ?? appointment;
    if (isPortalDeadStatus(freshAppointment.status)) {
      await this.releaseClaimQuietly(input);
      throw new PortalAppointmentInactiveError();
    }

    try {
      await this.applyJoin(input, freshAppointment, group, group.assignedInspectorId);
    } catch (error) {
      // Best-effort release so the tenant can retry with the same link;
      // never mask the original failure.
      await this.releaseClaimQuietly(input);
      throw error;
    }

    return {
      scheduledDate: input.scheduledDate,
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      appointmentStatus: 'SCHEDULED',
      inspector: { id: group.assignedInspectorId, name: assignedInspectorName },
    };
  }

  /** Best-effort rollback of the claim; a release failure leaves it consumed (fail-closed). */
  private async releaseClaimQuietly(input: JoinGroupInput): Promise<void> {
    try {
      await this.tokenRepo.releaseClaim(input.tokenId, input.appointmentId);
    } catch (err) {
      this.logger?.warn(
        { err, appointmentId: input.appointmentId, tokenId: input.tokenId },
        'Failed to release the portal token claim; the tenant cannot retry with this link',
      );
    }
  }

  /**
   * Side-effect sequence (spec §5.2 steps 4-13), executed only after the
   * token claim succeeded.
   */
  private async applyJoin(
    input: JoinGroupInput,
    appointment: AppointmentEntity,
    group: ServiceGroupEntity,
    /** Already narrowed to non-null by the caller's group validation. */
    inspectorId: string,
  ): Promise<void> {
    const previousGroupId = appointment.serviceGroupId;
    const previousValues = {
      serviceGroupId: previousGroupId,
      scheduledDate: appointment.scheduledDate,
      timeSlot: `${appointment.timeSlotStart}-${appointment.timeSlotEnd}`,
      status: appointment.status,
    };

    // 4-8. Take the slot. The capacity re-check and the appointment write share
    // one transaction holding a lock on the group, so two tenants racing for the
    // last opening cannot both pass — the loser gets `false` and nothing is
    // written. The token claim above only guards replays of the *same* token.
    const reservation = await this.serviceGroupRepo.reservePortalWindow({
      groupId: group.id,
      appointmentId: input.appointmentId,
      tenantId: appointment.tenantId,
      scheduledDate: input.scheduledDate,
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      inspectorId,
      ...(input.rentalTenantNote !== undefined ? { rentalTenantNote: input.rentalTenantNote } : {}),
    });
    if (!reservation.ok) {
      // A full window sends the tenant back to pick another time; an inactive
      // appointment means there is nothing left to move, so saying "full" would
      // just send them round the picker to fail again.
      throw reservation.reason === 'WINDOW_FULL'
        ? new PortalGroupFullError()
        : new PortalAppointmentInactiveError();
    }

    // Detach from the previous group only once the new slot is actually held,
    // so a lost race never leaves the tenant decremented out of both groups.
    if (previousGroupId) {
      await this.serviceGroupRepo.decrementConfirmedCount(previousGroupId);
    }

    // 6. Transition to SCHEDULED only when not already in that status
    // (AWAITING_INSPECTOR → SCHEDULED is the normal path; SCHEDULED appointments
    // switching groups must skip this transition to avoid APPOINTMENT_INVALID_TRANSITION)
    //
    // From REJECTED it takes two hops. There is no REJECTED → SCHEDULED rule, and
    // adding one would invent a shortcut the operator-facing recovery does not
    // have; going through AWAITING_INSPECTOR reuses the existing recovery
    // semantics and leaves an audit trail that says what actually happened. The
    // slot above is already reserved, so `service_group_id` points at the new
    // live group by the time the AWAITING_INSPECTOR guard checks for one.
    //
    // The reservation above already committed in its own transaction, so a hop
    // that throws here leaves the appointment holding the new slot inside a live
    // group while its status still says otherwise. Nothing can roll that back
    // from here, so the inconsistency is at least made greppable rather than
    // vanishing into the caller's 500. Composing the reservation and the hops
    // into one transaction is the real fix and is deliberately out of scope.
    try {
      if (appointment.status === 'REJECTED') {
        await this.statusTransition.execute({
          appointmentId: input.appointmentId,
          targetStatus: 'AWAITING_INSPECTOR',
          reason: REJOIN_RECOVERY_REASON,
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
        });
      }

      if (appointment.status !== 'SCHEDULED') {
        await this.statusTransition.execute({
          appointmentId: input.appointmentId,
          targetStatus: 'SCHEDULED',
          reason: `Tenant joined service group ${group.id} via portal`,
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
        });
      }
    } catch (err) {
      this.logger?.error(
        {
          err,
          appointmentId: input.appointmentId,
          groupId: group.id,
          previousGroupId,
          statusBeforeJoin: appointment.status,
        },
        'Portal group join reserved the slot but the status transition failed; appointment is in the new group with a stale status and needs manual repair',
      );
      throw err;
    }

    // 6b. Keep the confirmation cycle in step. `reservePortalWindow` sets
    // `rental_tenant_confirmation_status` with a raw column write, so without
    // this the cycle row would still read PENDING — or UNAVAILABLE, after a
    // decline — while the appointment column reads CONFIRMED. Best-effort: an
    // appointment predating the cycle feature has none, and the join is already
    // committed by this point, so a missing cycle must not undo it.
    if (this.cycleService) {
      try {
        await this.cycleService.realignActiveCycleSchedule(
          input.appointmentId,
          appointment.tenantId,
          new Date(input.scheduledDate),
          `${input.timeSlotStart}-${input.timeSlotEnd}`,
        );
        await this.cycleService.confirm(
          input.appointmentId,
          appointment.tenantId,
          'RENTAL_TENANT_PORTAL',
          input.tokenId,
        );
      } catch (err) {
        // Only "there is no cycle" is expected here — an appointment predating
        // the cycle feature. Everything else (a DB failure mid-confirm) leaves the
        // cycle row pinned to the old date and status while the appointment column
        // reads CONFIRMED, which later portal-link decisions read. Swallowing that
        // silently would make the divergence undiscoverable, so it gets logged.
        if (!(err instanceof ConfirmationCycleNotFoundError)) {
          this.logger?.error(
            { err, appointmentId: input.appointmentId, groupId: group.id },
            'Confirmation cycle not realigned after a portal group join; cycle and appointment status may diverge',
          );
        }
      }
    }

    // 7. Increment confirmed_count of new group
    await this.serviceGroupRepo.incrementConfirmedCount(group.id);

    // 10. Record GROUP_JOIN activity
    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'GROUP_JOIN',
      previousValuesJson: previousValues as Record<string, unknown>,
      newValuesJson: {
        serviceGroupId: group.id,
        scheduledDate: input.scheduledDate,
        timeSlot: `${input.timeSlotStart}-${input.timeSlotEnd}`,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 11. Audit log
    this.auditService.log({
      action: 'rental_tenant_portal.group_joined',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues as Record<string, unknown>,
      after: {
        serviceGroupId: group.id,
        scheduledDate: input.scheduledDate,
        timeSlotStart: input.timeSlotStart,
        timeSlotEnd: input.timeSlotEnd,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      metadata: {
        groupId: group.id,
        previousGroupId,
        urgentMode: false,
        selectedSlot: {
          scheduledDate: input.scheduledDate,
          timeSlotStart: input.timeSlotStart,
          timeSlotEnd: input.timeSlotEnd,
        },
      },
      ipAddress: input.ipAddress ?? undefined,
    });

    // 13. Fire-and-forget notification
    if (this.onNotificationHandler) {
      try {
        await this.onNotificationHandler.execute({
          appointmentId: input.appointmentId,
          tenantId: appointment.tenantId,
          action: 'GROUP_JOIN',
        });
      } catch {
        // notification failure must not affect the join
      }
    }

    // 14. The move may have emptied the group the tenant left. The transition event
    // carries the *new* group, so the empty-group subscriber cannot see this case —
    // check it explicitly.
    //
    // Genuinely not awaited: the join is already committed and must stand, and this
    // cleanup is best-effort, so the tenant's response must not wait on it. The daily
    // sweep is the backstop if it fails or never finishes.
    if (previousGroupId && this.cancelEmptyGroup) {
      void this.cancelEmptyGroup.cancelIfDead(previousGroupId).catch(() => {
        // swallowed by design — see above
      });
    }
  }
}
