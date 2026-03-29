import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IServiceTypeReader } from '../../domain/service-type-reader';
import { T1VisibilityService } from '../../domain/t1-visibility.service';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface GetInspectorScheduleInput {
  date?: string; // YYYY-MM-DD, defaults to today
  actor: AuthContext;
}

export interface ScheduleAppointmentItem {
  id: string;
  status: string;
  scheduledDate: string;
  timeSlot: string;
  serviceTypeId: string;
  propertyId: string;
  tenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  isOverdue?: boolean;
}

export interface GetInspectorScheduleOutput {
  date: string;
  appointments: ScheduleAppointmentItem[];
}

export class GetInspectorScheduleUseCase {
  private readonly t1Service = new T1VisibilityService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly serviceTypeReader: IServiceTypeReader,
  ) {}

  async execute(input: GetInspectorScheduleInput): Promise<GetInspectorScheduleOutput> {
    const { actor } = input;

    if (actor.role !== 'INSP') {
      throw new ForbiddenError('FORBIDDEN', 'Only inspectors can access the schedule');
    }

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    const today = new Date();
    const targetDateStr = input.date ?? today.toISOString().split('T')[0]!;

    const appointments = await this.appointmentRepo.findAll(
      {
        inspectorId: actor.inspectorId,
        status: 'SCHEDULED',
        fromDate: targetDateStr,
        toDate: targetDateStr,
      },
      { page: 1, pageSize: 1000, sortBy: 'time_slot', sortOrder: 'asc' },
    );

    // Load service types for T-1 filtering
    const serviceTypeIds = [...new Set(appointments.map((a) => a.appointment.serviceTypeId))];
    const serviceTypes =
      serviceTypeIds.length > 0 ? await this.serviceTypeReader.findByIds(serviceTypeIds) : [];
    const serviceTypeMap = new Map(serviceTypes.map((st) => [st.id, st]));

    // Apply T-1 visibility filter
    const visibleAppointments = appointments.filter((item) => {
      const st = serviceTypeMap.get(item.appointment.serviceTypeId);
      const flowType = st?.flowType ?? 'ROUTINE';
      return this.t1Service.isVisibleForInspector(
        flowType,
        item.appointment.tenantConfirmationStatus,
        item.appointment.keyRequired,
        item.appointment.scheduledDate,
        today,
      );
    });

    // Load execution statuses for visible appointments
    const appointmentIds = visibleAppointments.map((a) => a.appointment.id);
    const executions =
      appointmentIds.length > 0
        ? await this.executionRepo.findByAppointmentIds(appointmentIds)
        : [];
    const executionMap = new Map(executions.map((e) => [e.appointmentId, e]));

    const items: ScheduleAppointmentItem[] = visibleAppointments.map((item) => {
      const appt = item.appointment;
      const exec = executionMap.get(appt.id);
      let executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' = 'NOT_STARTED';
      if (exec) {
        executionStatus = exec.isFinished() ? 'FINISHED' : 'IN_PROGRESS';
      }

      return {
        id: appt.id,
        status: appt.status,
        scheduledDate: targetDateStr,
        timeSlot: appt.timeSlot,
        serviceTypeId: appt.serviceTypeId,
        propertyId: appt.propertyId,
        tenantConfirmationStatus: appt.tenantConfirmationStatus,
        keyRequired: appt.keyRequired,
        meetingLocation: appt.meetingLocation,
        executionStatus,
      };
    });

    // When viewing today's schedule, include overdue appointments (scheduled before today)
    const todayStr = today.toISOString().split('T')[0]!;
    if (targetDateStr === todayStr) {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0]!;

      const overdueAppointments = await this.appointmentRepo.findAll(
        {
          inspectorId: actor.inspectorId,
          status: 'SCHEDULED',
          toDate: yesterdayStr,
        },
        { page: 1, pageSize: 1000, sortBy: 'scheduled_date', sortOrder: 'asc' },
      );

      // Load execution statuses for overdue appointments
      const overdueIds = overdueAppointments.map((a) => a.appointment.id);
      const overdueExecutions =
        overdueIds.length > 0
          ? await this.executionRepo.findByAppointmentIds(overdueIds)
          : [];
      const overdueExecMap = new Map(overdueExecutions.map((e) => [e.appointmentId, e]));

      const overdueItems: ScheduleAppointmentItem[] = overdueAppointments.map((item) => {
        const appt = item.appointment;
        const exec = overdueExecMap.get(appt.id);
        let executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' = 'NOT_STARTED';
        if (exec) {
          executionStatus = exec.isFinished() ? 'FINISHED' : 'IN_PROGRESS';
        }

        return {
          id: appt.id,
          status: appt.status,
          scheduledDate: appt.scheduledDate.toISOString().split('T')[0]!,
          timeSlot: appt.timeSlot,
          serviceTypeId: appt.serviceTypeId,
          propertyId: appt.propertyId,
          tenantConfirmationStatus: appt.tenantConfirmationStatus,
          keyRequired: appt.keyRequired,
          meetingLocation: appt.meetingLocation,
          executionStatus,
          isOverdue: true,
        };
      });

      items.unshift(...overdueItems);
    }

    return {
      date: targetDateStr,
      appointments: items,
    };
  }
}
