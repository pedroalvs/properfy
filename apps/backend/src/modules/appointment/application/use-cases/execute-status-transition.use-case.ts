import type { AuthContext, AppointmentStatus } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { AppointmentStateMachine } from '../../domain/appointment-state-machine';
import { ForbiddenError, DomainError } from '../../../../shared/domain/errors';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
  AppointmentInvalidTransitionError,
  AppointmentTransitionNotPermittedError,
  AppointmentReasonRequiredError,
  AppointmentDoneCheckRequiredError,
  AppointmentDoneCheckerInvalidRoleError,
  AppointmentDoneCheckerSelfCheckError,
  AppointmentInspectorRequiredError,
  AppointmentTenantConfirmationRequiredError,
  AppointmentServiceGroupRequiredError,
} from '../../domain/appointment.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ExecuteStatusTransitionInput {
  appointmentId: string;
  targetStatus: AppointmentStatus;
  reason?: string;
  cancellationReasonCode?: string;
  rejectionReasonCode?: string;
  doneCheckedByUserId?: string;
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
    private readonly onDoneHandler?: OnDoneHandler,
    private readonly onTransitionHandler?: OnTransitionHandler,
    private readonly authorizationService?: AuthorizationService,
    private readonly serviceTypeRepo?: IServiceTypeRepository,
  ) {}

  async execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput> {
    const { appointmentId, targetStatus, reason, cancellationReasonCode, rejectionReasonCode, doneCheckedByUserId, inspectorId, idempotencyKey, actor } = input;

    // 0. Idempotency check
    if (idempotencyKey) {
      const cached = await this.idempotencyService.get<ExecuteStatusTransitionOutput>(
        idempotencyKey,
        'status-transition',
      );
      if (cached) return cached;
    }

    // 1. Find appointment (AM/OP: tenantId=null for global access, CL roles: own tenant, INSP: any but validated after)
    const tenantId = actor.role === 'AM' || actor.role === 'OP' ? null : actor.tenantId;
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
    if (actor.role === 'CL_USER' && this.authorizationService) {
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
        if (inspector?.userId && inspector.userId === doneCheckedByUserId) {
          throw new AppointmentDoneCheckerSelfCheckError();
        }
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

    // TODO: When transitioning to SCHEDULED with an inspector, find and book the matching
    // availability slot (inspectorId + scheduledDate + overlapping timeSlot → status = BOOKED)

    // Set done check for DONE (optional — set when provided)
    if (doneCheckedByUserId) {
      updateData.doneCheckedByUserId = doneCheckedByUserId;
      updateData.doneCheckedAt = now;
    }

    // Clear done check on reopen from DONE
    if (appointment.status === 'DONE' && targetStatus === 'DRAFT') {
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
    if (targetStatus === 'DONE' && actor.role === 'INSP' && !doneCheckedByUserId) {
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

    // 9d. Side effect: create financial entries only after operator cross-check
    if (targetStatus === 'DONE' && doneCheckedByUserId && this.onDoneHandler) {
      try {
        await this.onDoneHandler.execute({ appointmentId });
      } catch {
        // Log but don't fail — transition is already persisted and audited
        // Financial entries can be created manually via billing API
      }
    }

    // 9e. Side effect: DONE → REJECTED — flag for financial review
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
