import type { AuthContext } from '@properfy/shared';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionNotStartedError,
  ExecutionNotFinishedError,
} from '../../domain/inspection-execution.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ReopenExecutionInput {
  appointmentId: string;
  reason: string;
  actor: AuthContext;
}

export interface ReopenExecutionOutput {
  executionId: string;
  appointmentId: string;
  startedAt: string;
  resumedAt: string;
}

export class ReopenExecutionUseCase {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ReopenExecutionInput): Promise<ReopenExecutionOutput> {
    const { appointmentId, reason, actor } = input;

    // 1. Reopening the InspectionExecution record (not the DONE→DRAFT state transition) — AM and OP allowed
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'appointment.reopen_done',
      entityType: 'InspectionExecution',
    });

    // 2. Load execution
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (!execution) {
      throw new ExecutionNotStartedError();
    }

    // 3. Must be finished
    if (!execution.isFinished()) {
      throw new ExecutionNotFinishedError();
    }

    // 4. Load appointment for tenant context
    const appointmentResult = await this.appointmentRepo.findById(appointmentId, null);
    const tenantId = appointmentResult?.appointment?.tenantId ?? null;

    // 5. Set resumed_at, clear finished_at — keep original started_at
    const now = new Date();
    await this.executionRepo.update(execution.id, {
      resumedAt: now,
      finishedAt: null,
    });

    // 6. Audit log
    this.auditService.log({
      action: 'inspection.execution_reopened',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectionExecution',
      entityId: execution.id,
      tenantId: tenantId ?? undefined,
      metadata: { reason, appointmentId },
    });

    return {
      executionId: execution.id,
      appointmentId,
      startedAt: execution.startedAt.toISOString(),
      resumedAt: now.toISOString(),
    };
  }
}
