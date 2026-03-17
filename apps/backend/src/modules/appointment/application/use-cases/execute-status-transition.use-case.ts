import type { AuthContext, AppointmentStatus } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import { AppointmentStateMachine } from '../../domain/appointment-state-machine';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  AppointmentNotFoundError,
  AppointmentAccessDeniedError,
  AppointmentInvalidTransitionError,
  AppointmentTransitionNotPermittedError,
  AppointmentReasonRequiredError,
  AppointmentDoneCheckerInvalidRoleError,
  AppointmentInspectorRequiredError,
} from '../../domain/appointment.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ExecuteStatusTransitionInput {
  appointmentId: string;
  targetStatus: AppointmentStatus;
  reason?: string;
  doneCheckedByUserId?: string;
  inspectorId?: string;
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
    private readonly auditService: AuditService,
    private readonly onDoneHandler?: OnDoneHandler,
    private readonly onTransitionHandler?: OnTransitionHandler,
  ) {}

  async execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput> {
    const { appointmentId, targetStatus, reason, doneCheckedByUserId, inspectorId, actor } = input;

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

    // 4. Check reason requirement
    if (rule.requiresReason && !reason) {
      throw new AppointmentReasonRequiredError();
    }

    // 5. Validate doneCheckedByUserId when provided (optional — not required by INSP)
    if (doneCheckedByUserId) {
      // Validate the checker is AM or OP
      const checker = await this.userRepo.findById(doneCheckedByUserId);
      if (!checker || (checker.role !== 'AM' && checker.role !== 'OP')) {
        throw new AppointmentDoneCheckerInvalidRoleError();
      }
    }

    // 6. Check inspectorId for SCHEDULED transition
    if (targetStatus === 'SCHEDULED' && !appointment.inspectorId && !inspectorId) {
      throw new AppointmentInspectorRequiredError();
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

    // Set inspector for SCHEDULED
    if (targetStatus === 'SCHEDULED' && inspectorId) {
      updateData.inspectorId = inspectorId;
    }

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

    // 9. Audit log
    this.auditService.log({
      action: 'appointment.status_transition',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      before: { status: appointment.status },
      after: { status: targetStatus },
      reason: reason ?? undefined,
    });

    // 9b. Side effect: create financial entries on DONE
    if (targetStatus === 'DONE' && this.onDoneHandler) {
      try {
        await this.onDoneHandler.execute({ appointmentId });
      } catch {
        // Log but don't fail — transition is already persisted and audited
        // Financial entries can be created manually via billing API
      }
    }

    // 9c. Side effect: notifications on transition
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

    // 10. Return result
    return {
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
  }
}
