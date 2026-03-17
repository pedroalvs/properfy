import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { DashboardRepository } from '../../domain/dashboard.repository';

export interface DashboardStatsOutput {
  appointmentsByStatus: {
    draft: number;
    awaitingInspector: number;
    scheduled: number;
    doneThisMonth: number;
  };
  recentAppointments: Array<{
    id: string;
    code: string;
    propertyAddress: string;
    status: string;
    scheduledDate: string;
  }>;
  pendingActions: {
    noResponseTenants: number;
    pendingFinancialEntries: number;
    processingReports: number;
  };
  quickStats: {
    totalProperties: number;
    activeInspectors: number;
    activeServiceGroups: number;
  };
}

export interface GetDashboardStatsInput {
  actor: AuthContext;
}

export class GetDashboardStatsUseCase {
  constructor(private readonly repository: DashboardRepository) {}

  async execute(input: GetDashboardStatsInput): Promise<DashboardStatsOutput> {
    const { actor } = input;

    // Only AM, OP, CL_ADMIN and CL_USER can view dashboard stats
    if (!['AM', 'OP', 'CL_ADMIN', 'CL_USER'].includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view dashboard stats');
    }

    // AM and OP get unscoped data; CL_ADMIN and CL_USER get tenant-scoped data
    const tenantId = ['CL_ADMIN', 'CL_USER'].includes(actor.role)
      ? actor.tenantId ?? undefined
      : undefined;

    return this.repository.getStats(tenantId);
  }
}
