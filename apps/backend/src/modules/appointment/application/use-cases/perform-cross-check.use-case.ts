import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IAuditLogRepository } from '../../../audit/domain/audit-log.repository';
import type { IInspectionExecutionRepository } from '../../../inspector-execution/domain/inspection-execution.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  AppointmentDoneCrossCheckAlreadyCompletedError,
  AppointmentDoneCrossCheckEvidenceIncompleteError,
  AppointmentDoneCrossCheckInvalidStatusError,
  AppointmentDoneCrossCheckOriginNotFoundError,
  AppointmentNotFoundError,
} from '../../domain/appointment.errors';

export interface PerformCrossCheckInput {
  appointmentId: string;
  actor: AuthContext;
}

export interface PerformCrossCheckOutput {
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

export class PerformCrossCheckUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly onDoneHandler?: OnDoneHandler,
  ) {}

  async execute(input: PerformCrossCheckInput): Promise<PerformCrossCheckOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], { action: 'appointment.cross_check', entityType: 'Appointment' });

    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new AppointmentNotFoundError();
    }

    const { appointment } = result;

    if (appointment.status !== 'DONE') {
      throw new AppointmentDoneCrossCheckInvalidStatusError(appointment.status);
    }

    if (appointment.doneCheckedAt || appointment.doneCheckedByUserId) {
      throw new AppointmentDoneCrossCheckAlreadyCompletedError();
    }

    // Determine who marked the appointment as DONE.
    // Prefer the denormalized column; fall back to audit log scan for backward compat.
    let doneByUserId: string | null = appointment.doneMarkedByUserId;

    if (!doneByUserId) {
      const latestTransitions = await this.auditLogRepo.findAll(
        {
          tenantId: appointment.tenantId,
          entityType: 'Appointment',
          entityId: appointment.id,
          action: 'appointment.status_transition',
        },
        {
          page: 1,
          pageSize: 20,
          sortOrder: 'desc',
        },
      );

      const doneTransition = latestTransitions.find((entry) => {
        const after = entry.afterJson as { status?: string } | null;
        return after?.status === 'DONE';
      });

      doneByUserId = doneTransition?.actorId ?? null;
    }

    if (!doneByUserId) {
      throw new AppointmentDoneCrossCheckOriginNotFoundError();
    }

    this.authorizationService.assertNotSelfApproval(input.actor.userId, doneByUserId, {
      action: 'appointment.cross_check',
      entityType: 'Appointment',
      entityId: input.appointmentId,
    });

    const execution = await this.executionRepo.findByAppointmentId(input.appointmentId);
    if (!execution || !execution.isFinished()) {
      throw new AppointmentDoneCrossCheckEvidenceIncompleteError();
    }

    const now = new Date();
    await this.appointmentRepo.update(appointment.id, appointment.tenantId, {
      doneCheckedByUserId: input.actor.userId,
      doneCheckedAt: now,
    });

    this.auditService.log({
      action: 'appointment.done_checked',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'Appointment',
      entityId: appointment.id,
      tenantId: appointment.tenantId,
      before: {
        status: appointment.status,
        doneCheckedByUserId: appointment.doneCheckedByUserId,
        doneCheckedAt: appointment.doneCheckedAt,
      },
      after: {
        status: appointment.status,
        doneCheckedByUserId: input.actor.userId,
        doneCheckedAt: now,
      },
      metadata: {
        event: 'appointment.done_checked',
        doneByUserId,
      },
    });

    if (this.onDoneHandler) {
      try {
        await this.onDoneHandler.execute({ appointmentId: appointment.id });
      } catch {
        // Cross-check is already persisted and audited; financial creation can be retried separately.
      }
    }

    return {
      id: appointment.id,
      status: appointment.status,
      previousStatus: appointment.status,
      reason: appointment.reason,
      inspectorId: appointment.inspectorId,
      doneCheckedByUserId: input.actor.userId,
      doneCheckedAt: now,
      updatedAt: now,
    };
  }
}
