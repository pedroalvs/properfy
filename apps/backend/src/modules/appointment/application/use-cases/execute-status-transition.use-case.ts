import type { AuthContext, AppointmentStatus, CancellationReasonCode, RejectionReasonCode } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentStateMachine } from '../../domain/appointment-state-machine';
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

interface OnTransitionHandler {
  execute(input: { appointmentId: string; previousStatus: string; targetStatus: string }): Promise<unknown>;
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
  ) {}

  async execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput> {
    const { appointmentId, targetStatus, reason, cancellationReasonCode, rejectionReasonCode, doneCheckedByUserId, crossCheckByUserId, inspectorId, idempotencyKey, actor } = input;

    // 0. Idempotency check
    if (idempotencyKey) {
      const cached = await this.idempotencyService.get<ExecuteStatusTransitionOutput>(
        idempotencyKey,
        'status-transition',
      );
      if (cached) return cached;
    }

    // 1. Find appointment. AM: tenantId=null for global access. OP: tenant-
    //    scoped per Sprint 1 W-4-IMPL (CORRECTION-001 close-it). CL roles:
    //    own tenant. INSP: any tenant but validated after via inspector_id.
    const tenantId = actor.role === 'AM' ? null : actor.tenantId;
    const result = await this.appointmentRepo.findById(appointmentId, tenantId);
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

    // 3b. CL_USER permission check — configurable permissions per tenant
    if (actor.role === 'CL_USER') {
      if (targetStatus === 'CANCELLED') {
        this.authorizationService.assertClUserPermission(actor, 'cancel_appointments');
      }
      if (targetStatus === 'REJECTED') {
        this.authorizationService.assertClUserPermission(actor, 'reject_appointments');
      }
    }

    // 3c. AWAITING_INSPECTOR requires a service group — direct release bypasses the marketplace flow
    if (targetStatus === 'AWAITING_INSPECTOR' && !appointment.serviceGroupId) {
      throw new AppointmentServiceGroupRequiredError();
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
      const serviceType = await this.serviceTypeRepo.findById(appointment.serviceTypeId);
      if (serviceType && serviceType.flowType === 'ROUTINE' && serviceType.requiresTenantConfirmation) {
        if (appointment.tenantConfirmationStatus !== 'CONFIRMED') {
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

    // Set typed reason codes based on target status
    if (targetStatus === 'CANCELLED' && cancellationReasonCode) {
      updateData.cancellationReasonCode = cancellationReasonCode;
    }
    if (targetStatus === 'REJECTED' && rejectionReasonCode) {
      updateData.rejectionReasonCode = rejectionReasonCode;
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

    // 8. Update appointment
    await this.appointmentRepo.update(appointmentId, appointment.tenantId, updateData);

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
      actorType: 'USER',
      actorId: actor.userId,
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
          previousStatus: appointment.status,
          targetStatus,
        });
      } catch {
        // fire-and-forget — notification failure must not affect the transition
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
        actorType: 'USER',
        reason: reason ?? undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      this.domainEventBus.emit({
        type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
        payload: transitionPayload as unknown as Record<string, unknown>,
        occurredAt: now,
      }).catch(() => {
        // fire-and-forget — event bus failure must not affect the transition
      });
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

    // 11. Cache idempotency result
    if (idempotencyKey) {
      await this.idempotencyService.set(idempotencyKey, 'status-transition', output, 24);
    }

    return output;
  }
}
