import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IServiceTypeReader } from '../../domain/service-type-reader';
import { T1VisibilityService } from '../../domain/t1-visibility.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
} from '../../domain/inspection-execution.errors';

export interface GetAppointmentDetailInput {
  appointmentId: string;
  actor: AuthContext;
}

export interface AppointmentDetailOutput {
  id: string;
  status: string;
  scheduledDate: string;
  timeSlot: string;
  serviceTypeId: string;
  propertyId: string;
  tenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  contact: {
    tenantName: string;
    primaryEmail: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
  } | null;
  restrictions: Array<{
    isHome: boolean;
    unavailableDaysJson: unknown;
    unavailableHoursJson: unknown;
    notes: string | null;
  }>;
  execution: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    startLatitude: number;
    startLongitude: number;
    finishLatitude: number | null;
    finishLongitude: number | null;
    status: 'IN_PROGRESS' | 'FINISHED';
  } | null;
  assets: Array<{
    id: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number | null;
    kind: string;
    status: string;
  }>;
}

export class GetAppointmentDetailUseCase {
  private readonly t1Service = new T1VisibilityService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly serviceTypeReader: IServiceTypeReader,
  ) {}

  async execute(input: GetAppointmentDetailInput): Promise<AppointmentDetailOutput> {
    const { appointmentId, actor } = input;

    if (actor.role !== 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Only inspectors can access appointment details');
    }

    // Load appointment with cross-tenant access (inspectors are cross-tenant)
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) {
      throw new ExecutionAppointmentNotFoundError();
    }

    const { appointment, contact, restrictions } = result;

    // Verify inspector assignment
    if (appointment.inspectorId !== actor.userId) {
      throw new ExecutionAppointmentNotFoundError();
    }

    // Only SCHEDULED or DONE appointments are accessible
    if (appointment.status !== 'SCHEDULED' && appointment.status !== 'DONE') {
      throw new ExecutionAppointmentNotFoundError();
    }

    // Apply T-1 rule for SCHEDULED appointments only
    if (appointment.status === 'SCHEDULED') {
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
      if (!isVisible) {
        throw new ExecutionT1BlockedError();
      }
    }

    // Load execution and assets
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    const assets = execution ? await this.assetRepo.findByExecutionId(execution.id) : [];

    return {
      id: appointment.id,
      status: appointment.status,
      scheduledDate:
        appointment.scheduledDate instanceof Date
          ? appointment.scheduledDate.toISOString().split('T')[0]!
          : String(appointment.scheduledDate),
      timeSlot: appointment.timeSlot,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      contact: contact
        ? {
            tenantName: contact.tenantName,
            primaryEmail: contact.primaryEmail,
            primaryPhone: contact.primaryPhone,
            secondaryPhone: contact.secondaryPhone,
          }
        : null,
      restrictions: restrictions.map((r) => ({
        isHome: r.isHome,
        unavailableDaysJson: r.unavailableDaysJson,
        unavailableHoursJson: r.unavailableHoursJson,
        notes: r.notes,
      })),
      execution: execution
        ? {
            id: execution.id,
            startedAt: execution.startedAt.toISOString(),
            finishedAt: execution.finishedAt?.toISOString() ?? null,
            startLatitude: execution.startLatitude,
            startLongitude: execution.startLongitude,
            finishLatitude: execution.finishLatitude,
            finishLongitude: execution.finishLongitude,
            status: execution.getStatus() as 'IN_PROGRESS' | 'FINISHED',
          }
        : null,
      assets: assets.map((a) => ({
        id: a.id,
        storageKey: a.storageKey,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        kind: a.kind,
        status: a.status,
      })),
    };
  }
}
