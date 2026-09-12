import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import type { ExecuteStatusTransitionUseCase } from '../../../appointment/application/use-cases/execute-status-transition.use-case';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
} from '../../domain/inspection-execution.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import { runInTransaction } from '../../../../shared/application/unit-of-work';

export interface FinishInspectionInput {
  appointmentId: string;
  latitude: number;
  longitude: number;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface FinishInspectionOutput {
  executionId: string;
  appointmentId: string;
  startedAt: string;
  finishedAt: string;
  appointmentStatus: string;
}

export class FinishInspectionUseCase {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly executeStatusTransition: ExecuteStatusTransitionUseCase,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    /**
     * Optional: when wired, the execution-finished persist and the SCHEDULED ->
     * DONE transition commit together in one transaction, so a transition
     * failure rolls back finishedAt instead of leaving a half-finished
     * execution (WI-4 / #119). Without it, degrades to the prior
     * non-transactional behaviour.
     */
    private readonly prisma?: PrismaClient,
  ) {}

  async execute(input: FinishInspectionInput): Promise<FinishInspectionOutput> {
    const {
      appointmentId,
      latitude,
      longitude,
      idempotencyKey,
      actor,
    } = input;

    // 1. INSP only
    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'appointment.mark_done',
      entityType: 'InspectionExecution',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // 2. Check idempotency
    const cached = await this.idempotencyService.get<FinishInspectionOutput>(
      idempotencyKey,
      'finish',
    );
    if (cached) return cached;

    // 3. Load execution
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (!execution) throw new ExecutionNotStartedError();

    if (execution.inspectorId !== actor.inspectorId) {
      throw new ForbiddenError('FORBIDDEN', 'Inspection execution is not assigned to this inspector');
    }

    // 4. Check not finished
    if (execution.isFinished()) throw new ExecutionAlreadyFinishedError();

    const appointmentResult = await this.appointmentRepo.findById(appointmentId, null);
    if (!appointmentResult) {
      throw new ExecutionAppointmentNotFoundError();
    }
    const { appointment } = appointmentResult;

    // 6-7. Persist finishedAt and trigger the SCHEDULED -> DONE transition atomically:
    // if the transition is refused, the finishedAt write must not survive it either.
    const now = new Date();
    let appointmentStatus = '';
    await runInTransaction(this.prisma, async ({ tx, defer }) => {
      await this.executionRepo.update(execution.id, {
        finishedAt: now,
        finishLatitude: latitude,
        finishLongitude: longitude,
      }, tx);

      const transitionResult = await this.executeStatusTransition.executeInTransaction({
        appointmentId,
        targetStatus: 'DONE',
        actor,
      }, tx);
      appointmentStatus = transitionResult.output.status;
      defer(transitionResult.runAfterCommit);
    });

    // 8. Audit log
    this.auditService.log({
      action: 'inspection_execution.finished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectionExecution',
      entityId: execution.id,
      tenantId: appointment.tenantId,
      after: {
        appointmentId,
        finishLatitude: latitude,
        finishLongitude: longitude,
      },
    });

    // 8b. Audit log for appointment timeline
    this.auditService.log({
      action: 'inspection.finished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      metadata: { latitude, longitude },
    });

    // 9. Store idempotency
    const output: FinishInspectionOutput = {
      executionId: execution.id,
      appointmentId,
      startedAt: execution.startedAt.toISOString(),
      finishedAt: now.toISOString(),
      appointmentStatus,
    };

    await this.idempotencyService.set(idempotencyKey, 'finish', output, 24);

    return output;
  }
}
