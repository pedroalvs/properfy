import type { AuthContext, AppointmentFieldActivityResponse } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../../inspector-execution/domain/inspection-execution.repository';
import type { IInspectorFieldEventRepository } from '../../../inspector-execution/domain/inspector-field-event.repository';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import { AppointmentNotFoundError } from '../../domain/appointment.errors';

const MAX_FIELD_EVENTS = 50;

export interface GetAppointmentFieldActivityInput {
  appointmentId: string;
  actor: AuthContext;
}

/**
 * Field activity (execution + field events) of an appointment, for the web detail
 * and map panels. Same tenant scope as GetAppointmentUseCase, but INSP has no
 * access (403) — this is an operational/agency view. Agency roles (CL_ADMIN /
 * CL_USER) never receive the inspector's raw coordinates (F03 privacy, §7.9):
 * the lat/lng keys are simply omitted for them, only derived distances/flags stay.
 */
export class GetAppointmentFieldActivityUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly fieldEventRepo: IInspectorFieldEventRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetAppointmentFieldActivityInput): Promise<AppointmentFieldActivityResponse> {
    const { appointmentId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], {
      action: 'appointment.field_activity.view',
      entityType: 'Appointment',
    });

    const isAgencyRole = actor.role === 'CL_ADMIN' || actor.role === 'CL_USER';
    const tenantId = isAgencyRole ? actor.tenantId : null;

    const found = await this.appointmentRepo.findById(appointmentId, tenantId);
    if (!found || found.appointment.isDeleted()) {
      throw new AppointmentNotFoundError();
    }
    if (isAgencyRole && found.appointment.tenantId !== actor.tenantId) {
      throw new AppointmentNotFoundError();
    }

    const canSeeCoordinates = !isAgencyRole;

    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    let executionSummary: AppointmentFieldActivityResponse['execution'] = null;
    if (execution) {
      const inspector = await this.inspectorRepo.findById(execution.inspectorId);
      executionSummary = {
        id: execution.id,
        inspectorName: inspector?.name ?? null,
        startedAt: execution.startedAt.toISOString(),
        finishedAt: execution.finishedAt?.toISOString() ?? null,
        abandonedAt: execution.abandonedAt?.toISOString() ?? null,
        startClientAt: execution.startClientAt?.toISOString() ?? null,
        finishClientAt: execution.finishClientAt?.toISOString() ?? null,
        startDistanceMeters: execution.geolocationDistanceMeters,
        finishDistanceMeters: execution.finishGeolocationDistanceMeters,
        startAccuracyMeters: execution.startAccuracyMeters,
        finishAccuracyMeters: execution.finishAccuracyMeters,
        outOfRadius: execution.outOfRadius,
        outOfWindow: execution.outOfWindow,
        finishOutOfRadius: execution.finishOutOfRadius,
        geofenceRadiusMeters: execution.geofenceRadiusMeters,
        ...(canSeeCoordinates
          ? {
              startLatitude: execution.startLatitude,
              startLongitude: execution.startLongitude,
              finishLatitude: execution.finishLatitude,
              finishLongitude: execution.finishLongitude,
            }
          : {}),
      };
    }

    const records = await this.fieldEventRepo.listByAppointmentId(appointmentId, MAX_FIELD_EVENTS);
    const events = records.map((record) => ({
      id: record.id,
      type: record.type,
      reason: record.reasonCode,
      note: record.note,
      minutesLate: record.minutes,
      inspectorName: record.inspectorName,
      occurredAt: record.occurredAt.toISOString(),
      clientOccurredAt: record.clientOccurredAt?.toISOString() ?? null,
      accuracyMeters: record.accuracyMeters,
      ...(canSeeCoordinates ? { latitude: record.latitude, longitude: record.longitude } : {}),
    }));

    return { execution: executionSummary, events };
  }
}
