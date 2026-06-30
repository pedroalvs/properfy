import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { DashboardRepository } from '../../domain/dashboard.repository';

export interface InspectorDayCount {
  inspectorId: string;
  inspectorName: string;
  count: number;
  alertLevel: 'yellow' | 'red' | null;
}

export interface InspectorBreakdowns {
  tomorrowByInspector: InspectorDayCount[];
  scheduledThisWeekByInspector: InspectorDayCount[];
  confirmedThisWeekByInspector: InspectorDayCount[];
}

export interface DashboardStatsOutput {
  appointmentsByStatus: {
    draft: number;
    awaitingInspector: number;
    scheduled: number;
    doneThisMonth: number;
    doneThisWeek: number;
    scheduledThisWeek: number;
    rejectedTotal: number;
  };
  recentAppointments: Array<{
    id: string;
    code: string;
    propertyAddress: string;
    status: string;
    doneCheckedByUserId: string | null;
    scheduledDate: string;
  }>;
  pendingActions: {
    noResponseRentalTenants: number;
    pendingOperatorCrossChecks: number;
    pendingFinancialEntries: number;
    processingReports: number;
  };
  quickStats: {
    totalProperties: number;
    activeInspectors: number;
    activeServiceGroups: number;
  };
  inspectorBreakdowns: InspectorBreakdowns | null;
}

export interface GetDashboardStatsInput {
  actor: AuthContext;
}

export class GetDashboardStatsUseCase {
  constructor(private readonly repository: DashboardRepository) {}

  /**
   * Returns aggregated dashboard statistics for the requesting actor.
   * AM/OP receive full inspector breakdowns; CL_ADMIN/CL_USER receive null for that section.
   */
  async execute(input: GetDashboardStatsInput): Promise<DashboardStatsOutput> {
    const { actor } = input;

    if (!['AM', 'OP', 'CL_ADMIN', 'CL_USER'].includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view dashboard stats');
    }

    const tenantId = ['CL_ADMIN', 'CL_USER'].includes(actor.role)
      ? actor.tenantId ?? undefined
      : undefined;

    const includeInspectorBreakdowns = ['AM', 'OP'].includes(actor.role);

    return this.repository.getStats(tenantId, includeInspectorBreakdowns);
  }
}
