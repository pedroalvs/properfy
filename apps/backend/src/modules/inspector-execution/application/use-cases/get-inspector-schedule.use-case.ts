import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface GetInspectorScheduleInput {
  date?: string; // YYYY-MM-DD, defaults to today
  from?: string; // range mode start
  to?: string;   // range mode end
  status?: 'DONE';
  page?: number;
  pageSize?: number;
  actor: AuthContext;
}

export interface ScheduleAppointmentItem {
  id: string;
  /** Formatted appointment code (e.g. "INS-0042"). */
  appointmentCode: string;
  status: string;
  scheduledDate: string;
  timeSlot: string;
  serviceTypeId: string;
  propertyId: string;
  tenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  agencyName: string;
  executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  isOverdue?: boolean;
}

export interface GetInspectorScheduleOutput {
  date: string;
  appointments: ScheduleAppointmentItem[];
}

export interface GetInspectorScheduleRangeOutput {
  data: ScheduleAppointmentItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class GetInspectorScheduleUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetInspectorScheduleInput): Promise<GetInspectorScheduleOutput | GetInspectorScheduleRangeOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'inspector.view_own',
      entityType: 'Appointment',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // Range mode: from/to provided
    if (input.from && input.to) {
      return this.executeRange(input, actor.inspectorId);
    }

    const today = new Date();
    const targetDateStr = input.date ?? today.toISOString().split('T')[0]!;

    // T-1 filtering is centralized inside findVisibleForInspector
    const visibleAppointments = await this.appointmentRepo.findVisibleForInspector({
      inspectorId: actor.inspectorId,
      fromDate: targetDateStr,
      toDate: targetDateStr,
      today,
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

      const codePrefix = item.tenantAppointmentCodePrefix ?? 'INS';
      const codePadded = String(appt.appointmentNumber).padStart(4, '0');

      return {
        id: appt.id,
        appointmentCode: `${codePrefix}-${codePadded}`,
        status: appt.status,
        scheduledDate: targetDateStr,
        timeSlot: appt.timeSlot,
        serviceTypeId: appt.serviceTypeId,
        propertyId: appt.propertyId,
        tenantConfirmationStatus: appt.tenantConfirmationStatus,
        keyRequired: appt.keyRequired,
        meetingLocation: appt.meetingLocation,
        agencyName: item.tenantName ?? '',
        executionStatus,
      };
    });

    // When viewing today's schedule, include overdue appointments (scheduled before today).
    // T-1 visibility is intentionally skipped for overdue items — they need operator attention regardless.
    const todayStr = today.toISOString().split('T')[0]!;
    if (targetDateStr === todayStr) {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0]!;

      const overdueAppointments = await this.appointmentRepo.findAll(
        {
          inspectorId: actor.inspectorId,
          status: ['SCHEDULED'],
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

        const codePrefix = item.tenantAppointmentCodePrefix ?? 'INS';
        const codePadded = String(appt.appointmentNumber).padStart(4, '0');

        return {
          id: appt.id,
          appointmentCode: `${codePrefix}-${codePadded}`,
          status: appt.status,
          scheduledDate: appt.scheduledDate.toISOString().split('T')[0]!,
          timeSlot: appt.timeSlot,
          serviceTypeId: appt.serviceTypeId,
          propertyId: appt.propertyId,
          tenantConfirmationStatus: appt.tenantConfirmationStatus,
          keyRequired: appt.keyRequired,
          meetingLocation: appt.meetingLocation,
          agencyName: item.tenantName ?? '',
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

  /** Range mode: returns paginated DONE appointments sorted newest-first. */
  private async executeRange(
    input: GetInspectorScheduleInput,
    inspectorId: string,
  ): Promise<GetInspectorScheduleRangeOutput> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    const statusFilter = input.status ? [input.status] : ['DONE'];

    const rows = await this.appointmentRepo.findAll(
      {
        inspectorId,
        status: statusFilter,
        fromDate: input.from,
        toDate: input.to,
      },
      { page, pageSize, sortBy: 'scheduled_date', sortOrder: 'desc' },
    );

    const total = await this.appointmentRepo.count({
      inspectorId,
      status: statusFilter,
      fromDate: input.from,
      toDate: input.to,
    });

    const appointmentIds = rows.map((r) => r.appointment.id);
    const executions = appointmentIds.length > 0
      ? await this.executionRepo.findByAppointmentIds(appointmentIds)
      : [];
    const executionMap = new Map(executions.map((e) => [e.appointmentId, e]));

    const data: ScheduleAppointmentItem[] = rows.map((item) => {
      const appt = item.appointment;
      const exec = executionMap.get(appt.id);
      let executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' = 'NOT_STARTED';
      if (exec) {
        executionStatus = exec.isFinished() ? 'FINISHED' : 'IN_PROGRESS';
      }
      const codePrefix = item.tenantAppointmentCodePrefix ?? 'INS';
      const codePadded = String(appt.appointmentNumber).padStart(4, '0');
      return {
        id: appt.id,
        appointmentCode: `${codePrefix}-${codePadded}`,
        status: appt.status,
        scheduledDate: appt.scheduledDate.toISOString().split('T')[0]!,
        timeSlot: appt.timeSlot,
        serviceTypeId: appt.serviceTypeId,
        propertyId: appt.propertyId,
        tenantConfirmationStatus: appt.tenantConfirmationStatus,
        keyRequired: appt.keyRequired,
        meetingLocation: appt.meetingLocation,
        agencyName: item.tenantName ?? '',
        executionStatus,
      };
    });

    return { data, total, page, pageSize };
  }
}
