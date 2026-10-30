import { randomUUID } from 'crypto';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { AuthContext, GeofenceMode } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IIdempotencyService } from '../../domain/idempotency.service';
import { InspectionExecutionEntity } from '../../domain/inspection-execution.entity';
import { InspectionStartGateService } from '../../../../shared/domain/inspection-start-gate.service';
import { haversineDistanceMeters } from '../../domain/geolocation-distance.service';
import { evaluateGeofence, type GeofenceFallbackReason } from '../../domain/geofence.service';
import { isOutOfCheckInWindow } from '../../domain/check-in-window.service';
import { resolveEffectiveEventTime } from '../../domain/client-occurred-at';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
  ExecutionAlreadyFinishedError,
  ExecutionTimeWindowError,
  GeofenceOutOfRadiusError,
} from '../../domain/inspection-execution.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceTypeReader } from '../../domain/service-type-reader';
import type { ITenantTimezoneLookup } from '../../../../shared/application/tenant-timezone';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';

/** `Decimal(10,2)` ceiling; clamp absurd accuracy rather than 400 (a 400 poisons an offline item). */
const MAX_DECIMAL_10_2 = 99_999_999.99;
const clampAccuracy = (accuracy: number | undefined): number | null =>
  accuracy === undefined ? null : Math.min(accuracy, MAX_DECIMAL_10_2);

export interface StartInspectionInput {
  appointmentId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  clientOccurredAt?: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface StartInspectionGeofence {
  mode: GeofenceMode;
  effectiveMode: GeofenceMode;
  radiusMeters: number;
  fallbackReason: GeofenceFallbackReason | null;
}

export interface StartInspectionOutput {
  executionId: string;
  appointmentId: string;
  startedAt: string;
  startLatitude: number;
  startLongitude: number;
  geolocationDistanceMeters: number | null;
  status: 'IN_PROGRESS';
  startAccuracyMeters: number | null;
  outOfRadius: boolean;
  outOfWindow: boolean;
  geofence: StartInspectionGeofence;
}

export class StartInspectionUseCase {
  private readonly startGateService = new InspectionStartGateService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly idempotencyService: IIdempotencyService,
    private readonly auditService: AuditService,
    private readonly serviceTypeReader: IServiceTypeReader,
    private readonly authorizationService: AuthorizationService,
    private readonly platformSettings: IPlatformSettingsReader,
    /** Cached tenants.timezone lookup; absent → platform-timezone gates. */
    private readonly tenantTimezoneLookup?: ITenantTimezoneLookup,
  ) {}

  async execute(input: StartInspectionInput): Promise<StartInspectionOutput> {
    const { appointmentId, latitude, longitude, idempotencyKey, actor } = input;
    const accuracy = clampAccuracy(input.accuracy);

    // 1. INSP only
    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'appointment.mark_done',
      entityType: 'InspectionExecution',
    });
    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // 2. Idempotency
    const cached = await this.idempotencyService.get<StartInspectionOutput>(idempotencyKey, 'start');
    if (cached) return cached;

    // 3. Load appointment + assignment/status checks
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) throw new ExecutionAppointmentNotFoundError();
    const { appointment } = result;
    if (appointment.inspectorId !== actor.inspectorId) throw new ExecutionAppointmentNotFoundError();
    if (appointment.status !== 'SCHEDULED') throw new ExecutionAppointmentNotFoundError();

    const now = new Date();
    const agencyTz =
      (await this.tenantTimezoneLookup?.getTenantTimezone(appointment.tenantId)) ?? PLATFORM_TIMEZONE;

    // 4. T-1 visibility (agency civil date).
    const todayCivil = civilDateInTimezone(now, agencyTz);
    const isVisible = await this.appointmentRepo.isAppointmentVisibleForInspector(appointmentId, todayCivil);
    if (!isVisible) throw new ExecutionT1BlockedError();

    // 4b. Tenant confirmation, re-checked for past dates (see original rationale).
    const serviceType = await this.serviceTypeReader.findById(appointment.serviceTypeId);
    const flowType = serviceType?.flowType ?? 'ROUTINE';
    const requiresConfirmationFlag = serviceType?.requiresRentalTenantConfirmation ?? true;
    const needsConfirmation = flowType === 'ROUTINE' && requiresConfirmationFlag && !appointment.keyRequired;
    if (needsConfirmation && appointment.rentalTenantConfirmationStatus !== 'CONFIRMED') {
      throw new ExecutionT1BlockedError();
    }

    // 4c. Start gate (agency local midnight onwards).
    const gateCheck = this.startGateService.isStartAllowed(appointment.scheduledDate, now, agencyTz);
    if (!gateCheck.allowed) {
      throw new ExecutionTimeWindowError(gateCheck.reason ?? 'Inspection day has not started yet');
    }

    // 5. Field-events settings (geofence radius/mode, window tolerance).
    const settings = await this.platformSettings.get('fieldEvents');
    const radiusMeters = settings.geofenceRadiusMeters;

    // 6. Existing execution (BEFORE geofence, so an in-progress retry is never re-blocked).
    const existing = await this.executionRepo.findByAppointmentId(appointmentId);
    if (existing) {
      if (existing.isFinished()) throw new ExecutionAlreadyFinishedError();
      return {
        executionId: existing.id,
        appointmentId: existing.appointmentId,
        startedAt: existing.startedAt.toISOString(),
        startLatitude: existing.startLatitude,
        startLongitude: existing.startLongitude,
        geolocationDistanceMeters: existing.geolocationDistanceMeters,
        status: 'IN_PROGRESS',
        startAccuracyMeters: existing.startAccuracyMeters,
        outOfRadius: existing.outOfRadius,
        outOfWindow: existing.outOfWindow,
        geofence: {
          mode: settings.geofenceMode,
          effectiveMode: settings.geofenceMode,
          radiusMeters: existing.geofenceRadiusMeters ?? radiusMeters,
          fallbackReason: null,
        },
      };
    }

    // 7. Distance to the property (null when the property has no coordinates).
    const propertyLat = result.propertyLatitude ?? null;
    const propertyLng = result.propertyLongitude ?? null;
    const geolocationDistanceMeters =
      propertyLat != null && propertyLng != null
        ? Math.round(haversineDistanceMeters(latitude, longitude, propertyLat, propertyLng))
        : null;

    // 8. Geofence. BLOCK falls back to FLAG when the measurement is unreliable.
    const geofence = evaluateGeofence({
      distanceMeters: geolocationDistanceMeters,
      accuracyMeters: accuracy,
      radiusMeters,
      mode: settings.geofenceMode,
    });
    if (geofence.blocked && geolocationDistanceMeters != null) {
      this.auditService.log({
        action: 'inspection.check_in_blocked',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        metadata: { distanceMeters: geolocationDistanceMeters, radiusMeters, accuracyMeters: accuracy },
      });
      throw new GeofenceOutOfRadiusError(geolocationDistanceMeters, radiusMeters, accuracy);
    }

    // 9. Check-in window, using the plausible device time when available.
    const { effectiveAt, clientTimePlausible } = resolveEffectiveEventTime(input.clientOccurredAt, now);
    let outOfWindow = false;
    let windowSkipped: 'IMPLAUSIBLE_CLIENT_TIME' | undefined;
    if (clientTimePlausible === false) {
      windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME';
    } else {
      outOfWindow = isOutOfCheckInWindow({
        effectiveAt,
        scheduledDate: appointment.scheduledDate.toISOString().slice(0, 10),
        timeSlotStart: appointment.timeSlotStart,
        timeSlotEnd: appointment.timeSlotEnd,
        toleranceMinutes: settings.checkInWindowToleranceMinutes,
        timeZone: agencyTz,
      });
    }

    // 10. Create execution (radius snapshot always written).
    const executionId = randomUUID();
    const clientAt = input.clientOccurredAt ? new Date(input.clientOccurredAt) : null;
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
      startAccuracyMeters: accuracy,
      startClientAt: clientAt && !Number.isNaN(clientAt.getTime()) ? clientAt : null,
      outOfRadius: geofence.outOfRadius,
      outOfWindow,
      geofenceRadiusMeters: radiusMeters,
      createdAt: now,
      updatedAt: now,
    });
    await this.executionRepo.save(execution);

    // 11. Audits.
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
        accuracyMeters: accuracy,
        outOfRadius: geofence.outOfRadius,
        outOfWindow,
      },
    });

    this.auditService.log({
      action: 'inspection.started',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId: appointment.tenantId,
      metadata: {
        latitude,
        longitude,
        geolocationDistanceMeters,
        accuracyMeters: accuracy,
        clientOccurredAt: input.clientOccurredAt ?? null,
        outOfRadius: geofence.outOfRadius,
        outOfWindow,
        geofenceMode: settings.geofenceMode,
        geofenceEffectiveMode: geofence.effectiveMode,
        radiusMeters,
        ...(windowSkipped ? { windowSkipped } : {}),
      },
    });

    if (geofence.outOfRadius) {
      this.auditService.log({
        action: 'inspection.geolocation_mismatch',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        tenantId: appointment.tenantId,
        metadata: {
          phase: 'START',
          inspectorLatitude: latitude,
          inspectorLongitude: longitude,
          propertyLatitude: propertyLat,
          propertyLongitude: propertyLng,
          distanceMeters: geolocationDistanceMeters,
          thresholdMeters: radiusMeters,
          accuracyMeters: accuracy,
        },
      });
    }

    // 12. Idempotency.
    const output: StartInspectionOutput = {
      executionId,
      appointmentId,
      startedAt: now.toISOString(),
      startLatitude: latitude,
      startLongitude: longitude,
      geolocationDistanceMeters,
      status: 'IN_PROGRESS',
      startAccuracyMeters: accuracy,
      outOfRadius: geofence.outOfRadius,
      outOfWindow,
      geofence: {
        mode: settings.geofenceMode,
        effectiveMode: geofence.effectiveMode,
        radiusMeters,
        fallbackReason: geofence.fallbackReason,
      },
    };
    await this.idempotencyService.set(idempotencyKey, 'start', output, 24);
    return output;
  }
}
