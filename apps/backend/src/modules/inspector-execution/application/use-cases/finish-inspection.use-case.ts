import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectorFieldEventRepository } from '../../domain/inspector-field-event.repository';
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
import { haversineDistanceMeters } from '../../domain/geolocation-distance.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';

const MAX_DECIMAL_10_2 = 99_999_999.99;
const clampAccuracy = (accuracy: number | undefined): number | null =>
  accuracy === undefined ? null : Math.min(accuracy, MAX_DECIMAL_10_2);

export interface FinishInspectionInput {
  appointmentId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  clientOccurredAt?: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface FinishInspectionOutput {
  executionId: string;
  appointmentId: string;
  startedAt: string;
  finishedAt: string;
  appointmentStatus: string;
  finishAccuracyMeters: number | null;
  finishGeolocationDistanceMeters: number | null;
  finishOutOfRadius: boolean;
}

export class FinishInspectionUseCase {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly executeStatusTransition: ExecuteStatusTransitionUseCase,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly prisma: PrismaClient | undefined,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly fieldEventRepo: IInspectorFieldEventRepository,
  ) {}

  async execute(input: FinishInspectionInput): Promise<FinishInspectionOutput> {
    const { appointmentId, latitude, longitude, idempotencyKey, actor } = input;
    const accuracy = clampAccuracy(input.accuracy);

    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'appointment.mark_done',
      entityType: 'InspectionExecution',
    });
    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    const cached = await this.idempotencyService.get<FinishInspectionOutput>(idempotencyKey, 'finish');
    if (cached) return cached;

    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (!execution || execution.isAbandoned()) throw new ExecutionNotStartedError();
    if (execution.inspectorId !== actor.inspectorId) {
      throw new ForbiddenError('FORBIDDEN', 'Inspection execution is not assigned to this inspector');
    }
    if (execution.isFinished()) throw new ExecutionAlreadyFinishedError();

    const appointmentResult = await this.appointmentRepo.findById(appointmentId, null);
    if (!appointmentResult) throw new ExecutionAppointmentNotFoundError();
    const { appointment } = appointmentResult;

    // Distance + out-of-radius flag at check-out (the finish never blocks — D15).
    const propertyLat = appointmentResult.propertyLatitude ?? null;
    const propertyLng = appointmentResult.propertyLongitude ?? null;
    const settings = await this.platformSettings.get('fieldEvents');
    const radiusMeters = settings.geofenceRadiusMeters;
    const finishDistanceMeters =
      propertyLat != null && propertyLng != null
        ? Math.round(haversineDistanceMeters(latitude, longitude, propertyLat, propertyLng))
        : null;
    const finishOutOfRadius = finishDistanceMeters != null && finishDistanceMeters > radiusMeters;
    const clientAt = input.clientOccurredAt ? new Date(input.clientOccurredAt) : null;
    const finishClientAt = clientAt && !Number.isNaN(clientAt.getTime()) ? clientAt : null;

    // Persist the finish capture and the SCHEDULED -> DONE transition atomically.
    const now = new Date();
    let appointmentStatus = '';
    await runInTransaction(this.prisma, async ({ tx, defer }) => {
      // First statement: lock the appointment row so finish and can't-do serialize
      // on the same row in the same order (consistent order = deadlock-safe).
      await this.fieldEventRepo.lockAppointmentForFieldEvent(appointmentId, tx!);

      // Re-read under the lock: a can't-do that committed between the checks above
      // and the lock may have abandoned (or a rare writer finished) the execution.
      const locked = await this.executionRepo.findByAppointmentId(appointmentId);
      if (!locked || locked.isAbandoned()) throw new ExecutionNotStartedError();
      if (locked.isFinished()) throw new ExecutionAlreadyFinishedError();

      await this.executionRepo.update(
        execution.id,
        {
          finishedAt: now,
          finishLatitude: latitude,
          finishLongitude: longitude,
          finishAccuracyMeters: accuracy,
          finishClientAt,
          finishGeolocationDistanceMeters: finishDistanceMeters,
          finishOutOfRadius,
        },
        tx,
      );

      // CAS: only finish a still-SCHEDULED appointment, so a concurrent transition
      // that already moved it loses cleanly (409) instead of a mixed state.
      const transitionResult = await this.executeStatusTransition.executeInTransaction(
        { appointmentId, targetStatus: 'DONE', expectedStatus: 'SCHEDULED', actor },
        tx,
      );
      appointmentStatus = transitionResult.output.status;
      defer(transitionResult.runAfterCommit);
    });

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
        accuracyMeters: accuracy,
        finishGeolocationDistanceMeters: finishDistanceMeters,
        finishOutOfRadius,
      },
    });

    this.auditService.log({
      action: 'inspection.finished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      metadata: {
        latitude,
        longitude,
        accuracyMeters: accuracy,
        clientOccurredAt: input.clientOccurredAt ?? null,
        distanceMeters: finishDistanceMeters,
        outOfRadius: finishOutOfRadius,
      },
    });

    // FINISH mismatch audit carries NO inspector coordinates (privacy, D10).
    if (finishOutOfRadius) {
      this.auditService.log({
        action: 'inspection.geolocation_mismatch',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        metadata: {
          phase: 'FINISH',
          distanceMeters: finishDistanceMeters,
          thresholdMeters: radiusMeters,
          accuracyMeters: accuracy,
        },
      });
    }

    const output: FinishInspectionOutput = {
      executionId: execution.id,
      appointmentId,
      startedAt: execution.startedAt.toISOString(),
      finishedAt: now.toISOString(),
      appointmentStatus,
      finishAccuracyMeters: accuracy,
      finishGeolocationDistanceMeters: finishDistanceMeters,
      finishOutOfRadius,
    };
    await this.idempotencyService.set(idempotencyKey, 'finish', output, 24);
    return output;
  }
}
