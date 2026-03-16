import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import type { IServiceTypeReader } from '../../domain/service-type-reader';
import { InspectionExecutionEntity } from '../../domain/inspection-execution.entity';
import { T1VisibilityService } from '../../domain/t1-visibility.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
  ExecutionAlreadyFinishedError,
} from '../../domain/inspection-execution.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface StartInspectionInput {
  appointmentId: string;
  latitude: number;
  longitude: number;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface StartInspectionOutput {
  executionId: string;
  appointmentId: string;
  startedAt: string;
  startLatitude: number;
  startLongitude: number;
  status: 'IN_PROGRESS';
}

export class StartInspectionUseCase {
  private readonly t1Service = new T1VisibilityService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly serviceTypeReader: IServiceTypeReader,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: StartInspectionInput): Promise<StartInspectionOutput> {
    const { appointmentId, latitude, longitude, idempotencyKey, actor } = input;

    // 1. INSP only
    if (actor.role !== 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Only inspectors can start inspections');
    }

    // 2. Check idempotency
    const cached = await this.idempotencyService.get<StartInspectionOutput>(
      idempotencyKey,
      'start',
    );
    if (cached) return cached;

    // 3. Load appointment
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) throw new ExecutionAppointmentNotFoundError();

    const { appointment } = result;

    // Check inspector assignment and status
    if (appointment.inspectorId !== actor.userId) {
      throw new ExecutionAppointmentNotFoundError();
    }
    if (appointment.status !== 'SCHEDULED') {
      throw new ExecutionAppointmentNotFoundError();
    }

    // 4. Apply T-1 rule
    const st = await this.serviceTypeReader.findById(appointment.serviceTypeId);
    const flowType = st?.flowType ?? 'ROUTINE';
    const today = new Date();
    const isVisible = this.t1Service.isVisibleForInspector(
      flowType,
      appointment.tenantConfirmationStatus,
      appointment.keyRequired,
      appointment.scheduledDate,
      today,
    );
    if (!isVisible) throw new ExecutionT1BlockedError();

    // 5. Check existing execution
    const existingExecution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (existingExecution) {
      if (existingExecution.isFinished()) {
        throw new ExecutionAlreadyFinishedError();
      }
      // Already in progress — return existing (idempotent start)
      const existingResult: StartInspectionOutput = {
        executionId: existingExecution.id,
        appointmentId: existingExecution.appointmentId,
        startedAt: existingExecution.startedAt.toISOString(),
        startLatitude: existingExecution.startLatitude,
        startLongitude: existingExecution.startLongitude,
        status: 'IN_PROGRESS',
      };
      return existingResult;
    }

    // 6. Create execution
    const now = new Date();
    const executionId = randomUUID();
    const execution = new InspectionExecutionEntity({
      id: executionId,
      appointmentId,
      inspectorId: actor.userId,
      startedAt: now,
      finishedAt: null,
      startLatitude: latitude,
      startLongitude: longitude,
      finishLatitude: null,
      finishLongitude: null,
      checklistJson: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.executionRepo.save(execution);

    // 7. Audit log
    this.auditService.log({
      action: 'inspection_execution.started',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectionExecution',
      entityId: executionId,
      tenantId: appointment.tenantId,
      after: {
        appointmentId,
        inspectorId: actor.userId,
        startLatitude: latitude,
        startLongitude: longitude,
      },
    });

    // 8. Store idempotency
    const output: StartInspectionOutput = {
      executionId,
      appointmentId,
      startedAt: now.toISOString(),
      startLatitude: latitude,
      startLongitude: longitude,
      status: 'IN_PROGRESS',
    };

    await this.idempotencyService.set(idempotencyKey, 'start', output, 24);

    return output;
  }
}
