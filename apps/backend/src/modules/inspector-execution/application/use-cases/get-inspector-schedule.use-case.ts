import { ServiceTypeFlowType, type AuthContext } from '@properfy/shared';
import type { AppointmentListItem, IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { InspectionExecutionEntity } from '../../domain/inspection-execution.entity';
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
  timeSlotStart: string;
  timeSlotEnd: string;
  serviceTypeId: string;
  propertyId: string;
  rentalTenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  agencyName: string;
  executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  isOverdue?: boolean;
}

export interface ScheduleMonthAppointmentItem extends ScheduleAppointmentItem {
  propertyAddress: string;
  suburb: string;
  serviceTypeName: string;
  flowType: ServiceTypeFlowType;
}

export interface GetInspectorScheduleOutput {
  date: string;
  appointments: ScheduleAppointmentItem[];
}

export interface GetInspectorScheduleRangeOutput {
  data: ScheduleMonthAppointmentItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ScheduleMonthDay {
  date: string;
  count: number;
  hasUrgent: boolean;
}

export interface GetInspectorScheduleMonthOutput {
  today: string;
  from: string;
  to: string;
  days: ScheduleMonthDay[];
  appointments: ScheduleMonthAppointmentItem[];
  overdueAppointments: ScheduleMonthAppointmentItem[];
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

    const items = visibleAppointments.map((item) =>
      this.toScheduleItem(item, executionMap, targetDateStr),
    );

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

      const overdueItems = overdueAppointments.map((item) =>
        this.toScheduleItem(item, overdueExecMap, undefined, true),
      );

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

    const data = rows.map((item) => this.toMonthItem(item, executionMap, false));

    return { data, total, page, pageSize };
  }

  async executeMonth(input: Pick<GetInspectorScheduleInput, 'actor'>): Promise<GetInspectorScheduleMonthOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'inspector.view_own',
      entityType: 'Appointment',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]!;
    const monthEnd = new Date(today);
    monthEnd.setUTCDate(monthEnd.getUTCDate() + 30);
    const toStr = monthEnd.toISOString().split('T')[0]!;

    const overdueFrom = new Date(today);
    overdueFrom.setUTCDate(overdueFrom.getUTCDate() - 30);
    const overdueFromStr = overdueFrom.toISOString().split('T')[0]!;
    const overdueTo = new Date(today);
    overdueTo.setUTCDate(overdueTo.getUTCDate() - 1);
    const overdueToStr = overdueTo.toISOString().split('T')[0]!;
    const [visibleAppointments, overdueAppointments] = await Promise.all([
      this.appointmentRepo.findVisibleForInspector({
        inspectorId: actor.inspectorId,
        fromDate: todayStr,
        toDate: toStr,
        today,
      }),
      this.appointmentRepo.findAll(
        {
          inspectorId: actor.inspectorId,
          status: ['SCHEDULED'],
          fromDate: overdueFromStr,
          toDate: overdueToStr,
        },
        { page: 1, pageSize: 1000, sortBy: 'scheduled_date', sortOrder: 'asc' },
      ),
    ]);

    const appointmentIds = [
      ...visibleAppointments.map((item) => item.appointment.id),
      ...overdueAppointments.map((item) => item.appointment.id),
    ];
    const executions =
      appointmentIds.length > 0
        ? await this.executionRepo.findByAppointmentIds(appointmentIds)
        : [];
    const executionMap = new Map(executions.map((e) => [e.appointmentId, e]));

    const appointments = visibleAppointments.map((item) =>
      this.toMonthItem(item, executionMap, false),
    );
    const overdueItems = overdueAppointments.map((item) =>
      this.toMonthItem(item, executionMap, true),
    );

    const days = this.buildMonthDays(todayStr, toStr, appointments);

    return {
      today: todayStr,
      from: todayStr,
      to: toStr,
      days,
      appointments,
      overdueAppointments: overdueItems,
    };
  }

  private buildMonthDays(
    from: string,
    to: string,
    appointments: ScheduleMonthAppointmentItem[],
  ): ScheduleMonthDay[] {
    const appointmentsByDate = new Map<string, ScheduleMonthAppointmentItem[]>();
    for (const appointment of appointments) {
      const items = appointmentsByDate.get(appointment.scheduledDate) ?? [];
      items.push(appointment);
      appointmentsByDate.set(appointment.scheduledDate, items);
    }

    const days: ScheduleMonthDay[] = [];
    const current = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (current <= end) {
      const date = current.toISOString().split('T')[0]!;
      const items = appointmentsByDate.get(date) ?? [];
      days.push({
        date,
        count: items.length,
        hasUrgent: items.some((item) => this.isUrgent(item)),
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return days;
  }

  private toMonthItem(
    item: AppointmentListItem,
    executionMap: Map<string, InspectionExecutionEntity>,
    isOverdue: boolean,
  ): ScheduleMonthAppointmentItem {
    const base = this.toScheduleItem(item, executionMap, undefined, isOverdue);
    return {
      ...base,
      propertyAddress: item.propertyAddress,
      suburb: item.propertySuburb ?? '',
      serviceTypeName: item.serviceTypeName || 'Inspection',
      flowType: item.serviceTypeFlowType ?? ServiceTypeFlowType.ROUTINE,
      isOverdue: isOverdue || undefined,
    };
  }

  private toScheduleItem(
    item: AppointmentListItem,
    executionMap: Map<string, InspectionExecutionEntity>,
    scheduledDateOverride?: string,
    isOverdue?: boolean,
  ): ScheduleAppointmentItem {
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
      scheduledDate: scheduledDateOverride ?? appt.scheduledDate.toISOString().split('T')[0]!,
      timeSlotStart: appt.timeSlotStart,
      timeSlotEnd: appt.timeSlotEnd,
      serviceTypeId: appt.serviceTypeId,
      propertyId: appt.propertyId,
      rentalTenantConfirmationStatus: appt.rentalTenantConfirmationStatus,
      keyRequired: appt.keyRequired,
      meetingLocation: appt.meetingLocation,
      agencyName: item.tenantName ?? '',
      executionStatus,
      isOverdue: isOverdue || undefined,
    };
  }

  private isUrgent(item: ScheduleMonthAppointmentItem): boolean {
    if (item.flowType !== ServiceTypeFlowType.ROUTINE) return false;
    if (item.keyRequired) return false;
    return item.rentalTenantConfirmationStatus !== 'CONFIRMED';
  }
}
