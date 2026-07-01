import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import { InspectionExecutionEntity } from '../../domain/inspection-execution.entity';
import {
  InspectionTimeWindowService,
  type InspectionTimeWindowBounds,
} from '../../../../shared/domain/inspection-time-window.service';
import {
  haversineDistanceMeters,
  GEOLOCATION_MISMATCH_THRESHOLD_METERS,
} from '../../domain/geolocation-distance.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
  ExecutionAlreadyFinishedError,
  ExecutionTimeWindowError,
} from '../../domain/inspection-execution.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ITenantSettingsReader {
  getTimeWindowBounds(tenantId: string): Promise<Partial<InspectionTimeWindowBounds> | null>;
}

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
  geolocationDistanceMeters: number | null;
  status: 'IN_PROGRESS';
}

export class StartInspectionUseCase {
  private readonly timeWindowService = new InspectionTimeWindowService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly auditService: AuditService,
    private readonly tenantSettingsReader?: ITenantSettingsReader,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: StartInspectionInput): Promise<StartInspectionOutput> {
    const { appointmentId, latitude, longitude, idempotencyKey, actor } = input;

    // 1. INSP only
    this.authorizationService!.assertRoles(actor, ['INSP'], {
      action: 'appointment.mark_done',
      entityType: 'InspectionExecution',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
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
    if (appointment.inspectorId !== actor.inspectorId) {
      throw new ExecutionAppointmentNotFoundError();
    }
    if (appointment.status !== 'SCHEDULED') {
      throw new ExecutionAppointmentNotFoundError();
    }

    // 4. Apply T-1 rule (centralized in repository)
    const today = new Date();
    const isVisible = await this.appointmentRepo.isAppointmentVisibleForInspector(
      appointmentId,
      today,
    );
    if (!isVisible) throw new ExecutionT1BlockedError();

    // 4b. Apply time window rule (configurable per tenant)
    const timeWindowBounds = this.tenantSettingsReader
      ? await this.tenantSettingsReader.getTimeWindowBounds(appointment.tenantId)
      : null;
    const windowCheck = this.timeWindowService.isWithinWindow(
      appointment.scheduledDate,
      appointment.timeSlotStart,
      appointment.timeSlotEnd,
      new Date(),
      timeWindowBounds ?? undefined,
    );
    if (!windowCheck.allowed) {
      throw new ExecutionTimeWindowError(windowCheck.reason ?? 'Outside inspection time window');
    }

    // 5. Compute geolocation distance to property
    const propertyLat = result.propertyLatitude;
    const propertyLng = result.propertyLongitude;
    let geolocationDistanceMeters: number | null = null;

    if (propertyLat != null && propertyLng != null) {
      geolocationDistanceMeters = Math.round(
        haversineDistanceMeters(latitude, longitude, propertyLat, propertyLng),
      );
    }

    // 6. Check existing execution
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
        geolocationDistanceMeters: existingExecution.geolocationDistanceMeters,
        status: 'IN_PROGRESS',
      };
      return existingResult;
    }

    // 7. Create execution
    const now = new Date();
    const executionId = randomUUID();
    const execution = new InspectionExecutionEntity({
      id: executionId,
      appointmentId,
      inspectorId: actor.inspectorId,
      startedAt: now,
      finishedAt: null,
      resumedAt: null,
      startLatitude: latitude,
      startLongitude: longitude,
      finishLatitude: null,
      finishLongitude: null,
      geolocationDistanceMeters,
      checklistJson: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.executionRepo.save(execution);

    // 8. Audit log
    this.auditService.log({
      action: 'inspection_execution.started',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectionExecution',
      entityId: executionId,
      tenantId: appointment.tenantId,
      after: {
        appointmentId,
        inspectorId: actor.inspectorId,
        startLatitude: latitude,
        startLongitude: longitude,
        geolocationDistanceMeters,
      },
    });

    // 8b. Audit log for appointment timeline
    this.auditService.log({
      action: 'inspection.started',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      metadata: { latitude, longitude, geolocationDistanceMeters },
    });

    // 8c. Geolocation mismatch warning (non-blocking)
    if (
      geolocationDistanceMeters != null &&
      geolocationDistanceMeters > GEOLOCATION_MISMATCH_THRESHOLD_METERS
    ) {
      this.auditService.log({
        action: 'inspection.geolocation_mismatch',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        metadata: {
          inspectorLatitude: latitude,
          inspectorLongitude: longitude,
          propertyLatitude: propertyLat,
          propertyLongitude: propertyLng,
          distanceMeters: geolocationDistanceMeters,
          thresholdMeters: GEOLOCATION_MISMATCH_THRESHOLD_METERS,
        },
      });
    }

    // 9. Store idempotency
    const output: StartInspectionOutput = {
      executionId,
      appointmentId,
      startedAt: now.toISOString(),
      startLatitude: latitude,
      startLongitude: longitude,
      geolocationDistanceMeters,
      status: 'IN_PROGRESS',
    };

    await this.idempotencyService.set(idempotencyKey, 'start', output, 24);

    return output;
  }
}
