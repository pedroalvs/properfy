import type { PrismaClient, Prisma } from '@prisma/client';
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
import { runInTransaction, type TransactionalResult } from '../../../../shared/application/unit-of-work';
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
  executeInTransaction(
    input: ExecuteStatusTransitionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<TransactionalResult<ExecuteStatusTransitionOutput>>;
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
    /** When wired, the join owns a transaction spanning the reservation and the hops. */
    private readonly prisma?: PrismaClient,
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
    // Already in the target group. Either the tenant is asking for something the
    // picker never offered, or a previous attempt tore: it reserved the slot and
    // then failed before the status caught up. Those are cheaply distinguishable
    // and deserve opposite answers, so the decision is deferred to the fresh
    // post-claim read below — the stale entity here cannot be trusted for it.
    // Only the unambiguous case is rejected up front, to avoid consuming the
    // token on a request that cannot succeed.
    if (appointment.serviceGroupId === group.id && !this.matchesRequestedWindow(appointment, input)) {
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
    if (!freshResult || isPortalDeadStatus(freshResult.appointment.status)) {
      // No silent fallback to the pre-claim entity: a vanished appointment means
      // the read this whole flow validated against is gone, and proceeding on it
      // would reserve a window for a row that may no longer exist. The DB gate in
      // reservePortalWindow would catch it, but reporting "inactive" here is the
      // honest answer rather than relying on a downstream predicate.
      await this.releaseClaimQuietly(input);
      throw new PortalAppointmentInactiveError();
    }
    const freshAppointment = freshResult.appointment;

    // The slot is already held and the window matches: this is an interrupted
    // join, not a new one. Re-reserving would double-count, so only the missing
    // status hops run. Validating against the appointment's OWN persisted
    // schedule is stricter than the offer list this path bypasses — that list is
    // built with `excludeGroupId`, so it could never contain this group anyway.
    if (freshAppointment.serviceGroupId === group.id) {
      try {
        await this.resumeJoin(input, freshAppointment, group, assignedInspectorName);
      } catch (error) {
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

  /**
   * Brings the confirmation cycle onto the slot just taken.
   *
   * `reservePortalWindow` writes `rental_tenant_confirmation_status` as a raw
   * column write, so without this the cycle row still reads PENDING — or
   * UNAVAILABLE, after a decline — while the appointment column reads CONFIRMED.
   *
   * Deliberately outside the transaction and best-effort: an appointment
   * predating the cycle feature simply has none.
   */
  private async realignCycle(
    input: JoinGroupInput,
    appointment: AppointmentEntity,
    group: ServiceGroupEntity,
  ): Promise<void> {
    if (!this.cycleService) return;
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
      // Only "there is no cycle" is expected here. Everything else (a DB failure
      // mid-confirm) leaves the cycle pinned to the old date and status while the
      // appointment column reads CONFIRMED, which later portal-link decisions
      // read — a divergence that must not be silent.
      if (!(err instanceof ConfirmationCycleNotFoundError)) {
        this.logger?.error(
          { err, appointmentId: input.appointmentId, groupId: group.id },
          'Confirmation cycle not realigned after a portal group join; cycle and appointment status may diverge',
        );
      }
    }
  }

  /** Does the appointment already sit on exactly the window being requested? */
  private matchesRequestedWindow(appointment: AppointmentEntity, input: JoinGroupInput): boolean {
    return (
      appointment.scheduledDate.toISOString().slice(0, 10) === input.scheduledDate &&
      appointment.timeSlotStart === input.timeSlotStart &&
      appointment.timeSlotEnd === input.timeSlotEnd
    );
  }

  /**
   * Finishes a join whose slot was already reserved.
   *
   * Reachable two ways: a genuine replay whose response was lost in flight, and a
   * join torn by a failure between the reservation and the hops. The second is no
   * longer producible now that both share a transaction, but rows torn before
   * that still exist and would otherwise be told "this slot is unavailable" —
   * false, and with no way out for the tenant.
   *
   * The reservation and both counters are skipped: the slot is held and already
   * counted. Only the status hops are missing.
   */
  private async resumeJoin(
    input: JoinGroupInput,
    appointment: AppointmentEntity,
    group: ServiceGroupEntity,
    assignedInspectorName: string,
  ): Promise<void> {
    if (appointment.status !== 'SCHEDULED') {
      await runInTransaction(this.prisma, async ({ tx, defer }) => {
        if (appointment.status === 'REJECTED') {
          const hop = await this.statusTransition.executeInTransaction({
            appointmentId: input.appointmentId,
            targetStatus: 'AWAITING_INSPECTOR',
            reason: REJOIN_RECOVERY_REASON,
            actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
          }, tx);
          defer(hop.runAfterCommit);
        }
        const hop = await this.statusTransition.executeInTransaction({
          appointmentId: input.appointmentId,
          targetStatus: 'SCHEDULED',
          reason: `Tenant joined service group ${group.id} via portal`,
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
        }, tx);
        defer(hop.runAfterCommit);
      });
    }

    await this.realignCycle(input, appointment, group);

    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'GROUP_JOIN',
      previousValuesJson: { serviceGroupId: group.id, status: appointment.status },
      newValuesJson: {
        serviceGroupId: group.id,
        scheduledDate: input.scheduledDate,
        timeSlot: `${input.timeSlotStart}-${input.timeSlotEnd}`,
        rentalTenantConfirmationStatus: 'CONFIRMED',
        // Distinguishes a completion from a fresh join in the activity log.
        resumed: true,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    this.auditService.log({
      action: 'rental_tenant_portal.group_joined',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: { serviceGroupId: group.id, status: appointment.status },
      after: {
        serviceGroupId: group.id,
        scheduledDate: input.scheduledDate,
        timeSlotStart: input.timeSlotStart,
        timeSlotEnd: input.timeSlotEnd,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      metadata: { groupId: group.id, resumed: true, inspectorName: assignedInspectorName },
      ipAddress: input.ipAddress ?? undefined,
    });
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

    // 4-8. Take the slot, move the counters and lift the status — all in one
    // transaction, so a failure at any point leaves nothing behind.
    //
    // Before this was composed, `reservePortalWindow` committed on its own and a
    // failing hop stranded the appointment holding a slot in a live group with a
    // stale status, its old group already decremented and the new one never
    // incremented — with no way to roll back from here.
    //
    // The transition's own side effects (notifications, portal-token mint and
    // revoke, pg-boss enqueue, the STATUS_TRANSITION subscriber that writes to
    // the very `service_groups` row we hold FOR UPDATE) are deliberately NOT in
    // here: they would deadlock or leave unrecallable effects behind on rollback.
    // They are collected and flushed after commit.
    //
    // Accepted risk: two tenants swapping A→B and B→A take the row locks in
    // opposite order and can deadlock. Postgres detects that immediately (40P01)
    // and aborts one side; the catch in `execute` releases the claim and the
    // tenant retries. Loud and self-healing, unlike the silent counter drift the
    // uncomposed version produced.
    await runInTransaction(this.prisma, async ({ tx, defer }) => {
      const reservation = await this.serviceGroupRepo.reservePortalWindow({
        groupId: group.id,
        appointmentId: input.appointmentId,
        tenantId: appointment.tenantId,
        scheduledDate: input.scheduledDate,
        timeSlotStart: input.timeSlotStart,
        timeSlotEnd: input.timeSlotEnd,
        inspectorId,
        ...(input.rentalTenantNote !== undefined ? { rentalTenantNote: input.rentalTenantNote } : {}),
      }, tx);
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
        await this.serviceGroupRepo.decrementConfirmedCount(previousGroupId, tx);
      }
      // Moved inside the transaction from after the transition: it targets the
      // row already held FOR UPDATE, so it costs no extra lock, and leaving it
      // outside is what let a failed hop skew the counts.
      await this.serviceGroupRepo.incrementConfirmedCount(group.id, tx);

      // 6. Transition to SCHEDULED only when not already in that status
      // (AWAITING_INSPECTOR → SCHEDULED is the normal path; SCHEDULED appointments
      // switching groups must skip this transition to avoid APPOINTMENT_INVALID_TRANSITION)
      //
      // From REJECTED it takes two hops. There is no REJECTED → SCHEDULED rule, and
      // adding one would invent a shortcut the operator-facing recovery does not
      // have; going through AWAITING_INSPECTOR reuses the existing recovery
      // semantics and leaves an audit trail that says what actually happened. The
      // reservation above ran in this same transaction, so the guards inside the
      // transition see the new `service_group_id`, `inspector_id` and
      // `rental_tenant_confirmation_status` — which is exactly why every read in
      // there has to take `tx`.
      if (appointment.status === 'REJECTED') {
        const hop = await this.statusTransition.executeInTransaction({
          appointmentId: input.appointmentId,
          targetStatus: 'AWAITING_INSPECTOR',
          reason: REJOIN_RECOVERY_REASON,
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
        }, tx);
        defer(hop.runAfterCommit);
      }

      if (appointment.status !== 'SCHEDULED') {
        const hop = await this.statusTransition.executeInTransaction({
          appointmentId: input.appointmentId,
          targetStatus: 'SCHEDULED',
          reason: `Tenant joined service group ${group.id} via portal`,
          actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId },
        }, tx);
        defer(hop.runAfterCommit);
      }
    });

    // 6b. Keep the confirmation cycle in step. `reservePortalWindow` sets
    // `rental_tenant_confirmation_status` with a raw column write, so without
    // this the cycle row would still read PENDING — or UNAVAILABLE, after a
    // decline — while the appointment column reads CONFIRMED. Best-effort: an
    // appointment predating the cycle feature has none, and the join is already
    // committed by this point, so a missing cycle must not undo it.
    await this.realignCycle(input, appointment, group);

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
