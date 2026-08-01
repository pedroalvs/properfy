import type { AuthContext, AppointmentStatus, CancellationReasonCode, RejectionReasonCode } from '@properfy/shared';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ConfirmationCycleService } from '../services/confirmation-cycle.service';
import { AppointmentStateMachine } from '../../domain/appointment-state-machine';
import { transactionalResult, type TransactionalResult } from '../../../../shared/application/unit-of-work';
import { isTerminalGroupStatus } from '../../../service-group/domain/service-group.validator';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
  AppointmentInvalidTransitionError,
  AppointmentTransitionNotPermittedError,
  AppointmentReasonRequiredError,
  AppointmentDoneCheckRequiredError,
  AppointmentDoneCheckerInvalidRoleError,
  AppointmentInspectorRequiredError,
  AppointmentTenantConfirmationRequiredError,
  AppointmentServiceGroupRequiredError,
} from '../../domain/appointment.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AppointmentTransitionEvent } from '@properfy/shared';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { APPOINTMENT_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface ExecuteStatusTransitionInput {
  appointmentId: string;
  targetStatus: AppointmentStatus;
  reason?: string;
  cancellationReasonCode?: CancellationReasonCode;
  rejectionReasonCode?: RejectionReasonCode;
  doneCheckedByUserId?: string;
  crossCheckByUserId?: string;
  inspectorId?: string;
  idempotencyKey?: string;
  /**
   * Cancellation only: also tell the rental tenant. The agency is always told.
   *
   * Absent means "tenant not notified", which is deliberately the safe default:
   * telling a rental tenant their long-past inspection was "cancelled" is noise,
   * and an automated sweep's first run would otherwise notify its entire
   * historical backlog at once. Sweeps therefore pass nothing at all.
   *
   * Honoured only when the tenant had actually confirmed the appointment — the
   * handler enforces that, so a direct API caller cannot bypass it.
   */
  notifyRentalTenant?: boolean;
  actor: AuthContext;
}

export interface ExecuteStatusTransitionOutput {
  id: string;
  status: string;
  previousStatus: string;
  reason: string | null;
  inspectorId: string | null;
  doneCheckedByUserId: string | null;
  doneCheckedAt: Date | null;
  updatedAt: Date;
}

interface OnDoneHandler {
  execute(input: { appointmentId: string }): Promise<unknown>;
}

/**
 * Narrow read port over service groups. Deliberately just the status: this use
 * case only needs to know whether a linked group is still alive, and depending on
 * the full `IServiceGroupRepository` would drag the whole group aggregate — plus
 * its appointment rows — into every transition.
 */
interface IServiceGroupStatusReader {
  findStatusById(id: string, tx?: Prisma.TransactionClient): Promise<string | null>;
}

interface OnTransitionHandler {
  execute(input: { appointmentId: string; tenantId?: string | null; previousStatus: string; targetStatus: string; notifyRentalTenant?: boolean }): Promise<unknown>;
}

export class ExecuteStatusTransitionUseCase {
  private readonly stateMachine = new AppointmentStateMachine();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly userRepo: IUserManagementRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly onDoneHandler?: OnDoneHandler,
    private readonly onTransitionHandler?: OnTransitionHandler,
    private readonly serviceTypeRepo?: IServiceTypeRepository,
    private readonly domainEventBus?: DomainEventBus,
    /** 028 — optional. When wired, supersedes the confirmation cycle on any → DRAFT transition. */
    private readonly cycleService?: ConfirmationCycleService,
    private readonly prisma?: PrismaClient,
    /**
     * Optional. When wired, a link to a terminal service group is dropped on
     * reopen and refused on release — see checks 3c and the → DRAFT branch.
     */
    private readonly serviceGroupRepo?: IServiceGroupStatusReader,
  ) {}

  /**
   * Unchanged for every existing caller: performs the write and then runs the
   * side effects, exactly as before.
   */
  async execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput> {
    const result = await this.executeInTransaction(input);
    await result.runAfterCommit();
    return result.output;
  }

  /**
   * The write phase only. Returns the output immediately and hands back the side
   * effects for the owner of the transaction to flush once it has committed.
   *
   * Pass `tx` when composing this into a larger transaction — every read below
   * then sees that transaction's uncommitted writes, which the portal join
   * depends on: its `serviceGroupId`, `inspectorId` and
   * `rentalTenantConfirmationStatus` guards read values the slot reservation
   * wrote moments earlier and has not committed.
   *
   * The side effects are deliberately NOT part of the transaction — they mint
   * and revoke portal tokens, enqueue jobs on another connection, and wake a
   * subscriber that writes to a row the caller may hold locked. See
   * `AfterCommitEffect`.
   */
  async executeInTransaction(
    input: ExecuteStatusTransitionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<TransactionalResult<ExecuteStatusTransitionOutput>> {
    const { appointmentId, targetStatus, reason, cancellationReasonCode, rejectionReasonCode, doneCheckedByUserId, crossCheckByUserId, inspectorId, idempotencyKey, notifyRentalTenant, actor } = input;

    // Automated flows act as SYS. Attribute their audit trail and events to the
    // system rather than filing them under a synthetic user id.
    const isSystemActor = actor.role === 'SYS';
    const actorType = isSystemActor ? 'SYSTEM' : 'USER';

    // 0. Idempotency check
    if (idempotencyKey) {
      const cached = await this.idempotencyService.get<ExecuteStatusTransitionOutput>(
        idempotencyKey,
        'status-transition',
        tx,
      );
      if (cached) return transactionalResult(cached, []);
    }

    // 1. Find appointment. AM: tenantId=null for global access. OP: tenant-
    //    scoped per Sprint 1 W-4-IMPL (CORRECTION-001 close-it). CL roles:
    //    own tenant. INSP: any tenant but validated after via inspector_id.
    const tenantId = actor.role === 'AM' ? null : actor.tenantId;
    const result = await this.appointmentRepo.findById(appointmentId, tenantId, tx);
    if (!result) throw new AppointmentNotFoundError();

    const { appointment } = result;

    // 2. INSP access check: must be assigned to this appointment
    if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (appointment.inspectorId !== actor.inspectorId) {
        throw new AppointmentAccessDeniedError();
      }
    }

    // 3. Validate transition exists in state machine
    const validation = this.stateMachine.validateTransition(
      appointment.status,
      targetStatus,
      actor.role,
    );

    if (!validation.valid) {
      if (!validation.rule) {
        throw new AppointmentInvalidTransitionError(appointment.status, targetStatus);
      }
      throw new AppointmentTransitionNotPermittedError();
    }

    const rule = validation.rule!;

    // 3a-bis. EXPIRED means "the system cancelled this because its date passed".
    // The web dialog hides it, but the API validates against the whole enum, so a
    // human actor could otherwise hand-label a cancellation as auto-expired and
    // destroy the distinction this code exists to make in reports.
    if (cancellationReasonCode === 'EXPIRED' && !isSystemActor) {
      throw new ForbiddenError(
        'CANCELLATION_REASON_CODE_SYSTEM_ONLY',
        'The EXPIRED cancellation reason is assigned by the system only',
      );
    }

    // 3b. CL_USER permission check — configurable permissions per tenant
    if (actor.role === 'CL_USER') {
      if (targetStatus === 'CANCELLED') {
        this.authorizationService.assertClUserPermission(actor, 'cancel_appointments');
      }
      if (targetStatus === 'REJECTED') {
        this.authorizationService.assertClUserPermission(actor, 'reject_appointments');
      }
    }

    // 3c. AWAITING_INSPECTOR requires a *live* service group — direct release
    // bypasses the marketplace flow, and a link to a terminal group is worse than
    // no link at all: the marketplace only offers PUBLISHED groups, so the
    // appointment would be invisible there while `canAddToGroup` refuses to
    // re-group it (ALREADY_GROUPED). Since the empty-group cleanup leaves its
    // members linked, that state is reachable via reopen → release.
    if (targetStatus === 'AWAITING_INSPECTOR') {
      if (!appointment.serviceGroupId) {
        throw new AppointmentServiceGroupRequiredError();
      }
      if (this.serviceGroupRepo) {
        const groupStatus = await this.serviceGroupRepo.findStatusById(appointment.serviceGroupId, tx);
        if (groupStatus === null || isTerminalGroupStatus(groupStatus)) {
          throw new AppointmentServiceGroupRequiredError();
        }
      }
    }

    // 4. Check reason requirement
    if (rule.requiresReason && !reason) {
      throw new AppointmentReasonRequiredError();
    }

    // 5. Validate doneCheckedByUserId (required for AM/OP when transition has requiresDoneCheckedBy;
    // INSP triggers DONE via finish inspection — cross-check by operator happens separately)
    if (rule.requiresDoneCheckedBy && !doneCheckedByUserId && actor.role !== 'INSP') {
      throw new AppointmentDoneCheckRequiredError();
    }
    if (doneCheckedByUserId) {
      // Validate the checker is AM or OP
      const checker = await this.userRepo.findById(doneCheckedByUserId);
      if (!checker || (checker.role !== 'AM' && checker.role !== 'OP')) {
        throw new AppointmentDoneCheckerInvalidRoleError();
      }
      // Inspector cannot cross-check their own work (compare user IDs)
      if (appointment.inspectorId) {
        const inspector = await this.inspectorRepo.findById(appointment.inspectorId);
        if (inspector?.userId) {
          this.authorizationService.assertNotSelfApproval(doneCheckedByUserId, inspector.userId, {
            action: 'appointment.cross_check',
            entityType: 'Appointment',
            entityId: appointmentId,
          });
        }
      }
    }

    // 5b. Validate crossCheckByUserId for compound DONE + cross-check
    if (crossCheckByUserId && targetStatus === 'DONE') {
      // Self-check: the actor performing the transition cannot also be the cross-checker
      this.authorizationService.assertNotSelfApproval(actor.userId, crossCheckByUserId, {
        action: 'appointment.cross_check',
        entityType: 'Appointment',
        entityId: appointmentId,
      });
      // Validate the cross-checker is AM or OP
      const crossChecker = await this.userRepo.findById(crossCheckByUserId);
      if (!crossChecker || (crossChecker.role !== 'AM' && crossChecker.role !== 'OP')) {
        throw new AppointmentDoneCheckerInvalidRoleError();
      }
    }

    // 6. Check inspectorId for SCHEDULED transition
    if (targetStatus === 'SCHEDULED' && !appointment.inspectorId && !inspectorId) {
      throw new AppointmentInspectorRequiredError();
    }

    // 6b. Service type confirmation rules for AWAITING_INSPECTOR → SCHEDULED
    if (appointment.status === 'AWAITING_INSPECTOR' && targetStatus === 'SCHEDULED' && this.serviceTypeRepo) {
      const serviceType = await this.serviceTypeRepo.findById(appointment.serviceTypeId, tx);
      if (serviceType && serviceType.flowType === 'ROUTINE' && serviceType.requiresRentalTenantConfirmation) {
        if (appointment.rentalTenantConfirmationStatus !== 'CONFIRMED') {
          throw new AppointmentTenantConfirmationRequiredError();
        }
      }
      // Ingoing/Outgoing: no tenant confirmation needed — proceed directly
    }

    // 7. Build update data
    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: targetStatus,
    };

    // Set reason for transitions that require it, clear on reopen
    if (rule.requiresReason) {
      updateData.reason = reason;
    } else if (targetStatus === 'DRAFT') {
      // Reopening — clear reason
      updateData.reason = null;
    }

    // 7b. Reopening: drop a link to a group that will never run again.
    //
    // Deliberately NOT folded into the reason branch above — that is an if/else on
    // `rule.requiresReason`, and every reopen the operator actually performs
    // (CANCELLED→DRAFT, REJECTED→DRAFT, DONE→DRAFT) *does* require a reason, so the
    // `else if (DRAFT)` arm never runs for them.
    //
    // The empty-group cleanup cancels a group while leaving its terminal members
    // linked, to keep the history. Reopening one of those members would otherwise
    // revive a live appointment attached to a CANCELLED group — invisible to the
    // marketplace, which only offers PUBLISHED groups, and un-regroupable because
    // `canAddToGroup` rejects any non-null link. Reopening is the operator's "that
    // cancellation was wrong" action, and EXPIRED cancellations make it common.
    if (targetStatus === 'DRAFT' && appointment.serviceGroupId && this.serviceGroupRepo) {
      const groupStatus = await this.serviceGroupRepo.findStatusById(appointment.serviceGroupId, tx);
      if (groupStatus === null || isTerminalGroupStatus(groupStatus)) {
        updateData.serviceGroupId = null;
      }
    }

    // Set typed reason codes based on target status
    if (targetStatus === 'CANCELLED' && cancellationReasonCode) {
      updateData.cancellationReasonCode = cancellationReasonCode;
    }
    if (targetStatus === 'REJECTED' && rejectionReasonCode) {
      updateData.rejectionReasonCode = rejectionReasonCode;
    } else if (appointment.status === 'REJECTED' && targetStatus !== 'REJECTED') {
      // Clear stale rejectionReasonCode when reopening from REJECTED.
      updateData.rejectionReasonCode = null;
    }

    // Set inspector for SCHEDULED
    if (targetStatus === 'SCHEDULED' && inspectorId) {
      updateData.inspectorId = inspectorId;
    }

    // Availability slot booking is handled at the service-group level (accept-offer / assign-inspector),
    // not at the individual appointment transition level.

    // Set who marked appointment as DONE
    if (targetStatus === 'DONE') {
      updateData.doneMarkedByUserId = actor.userId;
    }

    // Set done check for DONE (optional — set when provided)
    if (doneCheckedByUserId) {
      updateData.doneCheckedByUserId = doneCheckedByUserId;
      updateData.doneCheckedAt = now;
    }

    // Compound DONE + cross-check: atomically set cross-check fields in the same update
    if (crossCheckByUserId && targetStatus === 'DONE') {
      updateData.doneCheckedByUserId = crossCheckByUserId;
      updateData.doneCheckedAt = now;
    }

    // Clear done check and done marker on reopen from DONE
    if (appointment.status === 'DONE' && targetStatus === 'DRAFT') {
      updateData.doneMarkedByUserId = null;
      updateData.doneCheckedByUserId = null;
      updateData.doneCheckedAt = null;
    }

    // 8. Update appointment (+ invalidate confirmation cycle if reopening).
    //
    // The write and the cycle invalidation must land together, so they share a
    // transaction: the caller's when there is one, otherwise our own. Passing the
    // client through is not decoration — without it the status write executes on
    // the global connection and survives the transaction rolling back, leaving a
    // DRAFT appointment with a live cycle.
    if (targetStatus === 'DRAFT' && this.cycleService) {
      const reopen = async (client?: Prisma.TransactionClient) => {
        await this.appointmentRepo.update(appointmentId, appointment.tenantId, updateData, client);
        await this.cycleService!.invalidateOnReopen(appointmentId, appointment.tenantId, client);
      };
      if (tx) await reopen(tx);
      else if (this.prisma) await this.prisma.$transaction((t) => reopen(t));
      else await reopen();
    } else {
      await this.appointmentRepo.update(appointmentId, appointment.tenantId, updateData, tx);
    }

    // 10. Build result
    const output: ExecuteStatusTransitionOutput = {
      id: appointmentId,
      status: targetStatus,
      previousStatus: appointment.status,
      reason: 'reason' in updateData
        ? (updateData.reason as string | null)
        : appointment.reason,
      inspectorId: 'inspectorId' in updateData
        ? (updateData.inspectorId as string | null)
        : appointment.inspectorId,
      doneCheckedByUserId: 'doneCheckedByUserId' in updateData
        ? (updateData.doneCheckedByUserId as string | null)
        : appointment.doneCheckedByUserId,
      doneCheckedAt: 'doneCheckedAt' in updateData
        ? (updateData.doneCheckedAt as Date | null)
        : appointment.doneCheckedAt,
      updatedAt: now,
    };

    // 11. Cache the idempotency result INSIDE the write phase, not after the side
    // effects. A key written outside the caller's transaction survives it rolling
    // back, and the retry then reads a cached success for a transition that never
    // happened. Writing it here also means a crash mid-notification can no longer
    // re-run a transition that already committed.
    if (idempotencyKey) {
      await this.idempotencyService.set(idempotencyKey, 'status-transition', output, 24, undefined, tx);
    }

    // Everything above is the write phase. What follows must not be: it mints and
    // revokes portal tokens, enqueues jobs on another connection, and wakes a
    // subscriber that writes to `service_groups` — the row a portal join holds
    // FOR UPDATE. Running any of it inside the caller's transaction would either
    // deadlock or leave an unrecallable effect behind if that transaction rolled
    // back. Order and individual error handling are preserved exactly.
    return transactionalResult(output, [async () => {
      // 9. Audit log — capture all fields that changed, resolve names for readability
      const beforeSnapshot: Record<string, unknown> = { status: appointment.status };
      const afterSnapshot: Record<string, unknown> = { status: targetStatus };
      const metadata: Record<string, unknown> = {};

      if (targetStatus === 'SCHEDULED' && inspectorId) {
        const inspector = await this.inspectorRepo.findById(inspectorId);
        const inspectorName = inspector?.name ?? inspectorId;
        afterSnapshot.inspector = inspectorName;
        metadata.inspectorId = inspectorId;
        metadata.inspectorName = inspectorName;
      }
      if (doneCheckedByUserId) {
        const reviewer = await this.userRepo.findById(doneCheckedByUserId);
        afterSnapshot.reviewedBy = reviewer?.name ?? doneCheckedByUserId;
        metadata.doneCheckedByUserId = doneCheckedByUserId;
      }
      if (crossCheckByUserId && targetStatus === 'DONE') {
        const reviewer = await this.userRepo.findById(crossCheckByUserId);
        afterSnapshot.reviewedBy = reviewer?.name ?? crossCheckByUserId;
        metadata.crossCheckByUserId = crossCheckByUserId;
        metadata.compoundTransition = true;
      }
      if (appointment.status === 'DONE' && targetStatus === 'DRAFT') {
        afterSnapshot.reviewedBy = null;
      }

      this.auditService.log({
        action: 'appointment.status_transition',
        actorType,
        actorId: isSystemActor ? undefined : actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        before: beforeSnapshot,
        after: afterSnapshot,
        reason: reason ?? undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });

      // 9b. Side effect: INSP marked DONE without operator cross-check — flag pending review
      if (targetStatus === 'DONE' && actor.role === 'INSP' && !doneCheckedByUserId && !crossCheckByUserId) {
        this.auditService.log({
          action: 'appointment.done_pending_crosscheck',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'Appointment',
          entityId: appointmentId,
          tenantId: appointment.tenantId,
          before: { status: appointment.status },
          after: { status: 'DONE' },
          metadata: { pendingOperatorCrossCheck: true },
        });
      }

      // 9c. Side effect: compound cross-check audit log
      if (targetStatus === 'DONE' && crossCheckByUserId) {
        await this.userRepo.findById(crossCheckByUserId);
        this.auditService.log({
          action: 'appointment.done_checked',
          actorType: 'USER',
          actorId: crossCheckByUserId,
          entityType: 'Appointment',
          entityId: appointmentId,
          tenantId: appointment.tenantId,
          before: {
            status: appointment.status,
            doneCheckedByUserId: null,
            doneCheckedAt: null,
          },
          after: {
            status: targetStatus,
            doneCheckedByUserId: crossCheckByUserId,
            doneCheckedAt: now,
          },
          metadata: {
            event: 'appointment.done_checked',
            doneByUserId: actor.userId,
            compoundTransition: true,
          },
        });
      }

      // 9d. Side effect: create financial entries only after operator cross-check
      if (targetStatus === 'DONE' && (doneCheckedByUserId || crossCheckByUserId) && this.onDoneHandler) {
        try {
          await this.onDoneHandler.execute({ appointmentId });
        } catch {
          // Log but don't fail — transition is already persisted and audited
          // Financial entries can be created manually via billing API
        }
      }

      // 9e. Side effect: DONE → REJECTED — flag for financial review and emit domain event
      if (appointment.status === 'DONE' && targetStatus === 'REJECTED') {
        this.auditService.log({
          action: 'appointment.done_rejected',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'Appointment',
          entityId: appointmentId,
          tenantId: appointment.tenantId,
          before: { status: 'DONE' },
          after: { status: 'REJECTED' },
          reason: reason ?? undefined,
          metadata: { requiresFinancialReview: true },
        });

        // Emit domain event for financial compensation
        if (this.domainEventBus) {
          this.domainEventBus.emit({
            type: APPOINTMENT_EVENTS.DONE_REJECTED,
            payload: {
              appointmentId,
              tenantId: appointment.tenantId,
              rejectedByUserId: actor.userId,
              reason: reason ?? null,
            },
            occurredAt: now,
          }).catch(() => {
            // fire-and-forget — event bus failure must not affect the transition
          });
        }
      }

      // 9f. Side effect: notifications on transition
      if (this.onTransitionHandler) {
        try {
          await this.onTransitionHandler.execute({
            appointmentId,
            notifyRentalTenant,
            tenantId: appointment.tenantId,
            previousStatus: appointment.status,
            targetStatus,
          });
        } catch (error) {
          // Still fire-and-forget: a notification failure must never roll back a
          // transition the operator already performed. But it must not vanish
          // either — this used to be a bare `catch {}` that did not even bind the
          // error, so the transition was audited as healthy while the tenant was
          // never told and nothing pointed at the appointment.
          this.auditService.log({
            action: 'notification.dispatch_failed',
            actorType: 'SYSTEM',
            entityType: 'Appointment',
            entityId: appointmentId,
            tenantId: appointment.tenantId,
            after: {
              previousStatus: appointment.status,
              targetStatus,
              // The class, not the message: an error surfacing from the send path
              // can carry a raw provider string that names the recipient, and an
              // audit row is immutable and outlives any erasure request. The
              // message is already on the notification row and in the logs.
              error: error instanceof Error ? error.constructor.name : 'UnknownError',
            },
          });
        }
      }

      // 9g. Emit typed domain event for transition
      if (this.domainEventBus) {
        const transitionPayload: AppointmentTransitionEvent = {
          appointmentId,
          tenantId: appointment.tenantId,
          fromStatus: appointment.status,
          toStatus: targetStatus,
          actorId: actor.userId,
          actorType,
          reason: reason ?? undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          serviceGroupId: appointment.serviceGroupId,
        };
        this.domainEventBus.emit({
          type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
          payload: transitionPayload as unknown as Record<string, unknown>,
          occurredAt: now,
        }).catch(() => {
          // fire-and-forget — event bus failure must not affect the transition
        });
      }

    }]);
  }
}
