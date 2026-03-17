import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';

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
  async execute(input: GetDashboardStatsInput): Promise<DashboardStatsOutput> {
    const { actor } = input;

    // Only AM, OP, CL_ADMIN and CL_USER can view dashboard stats
    if (!['AM', 'OP', 'CL_ADMIN', 'CL_USER'].includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view dashboard stats');
    }

    // Return hardcoded mock data until real repositories are wired
    return {
      appointmentsByStatus: {
        draft: 5,
        awaitingInspector: 8,
        scheduled: 12,
        doneThisMonth: 34,
      },
      recentAppointments: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          code: 'APT-001',
          propertyAddress: '123 Main St, Sydney NSW 2000',
          status: 'SCHEDULED',
          scheduledDate: new Date().toISOString().split('T')[0]!,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          code: 'APT-002',
          propertyAddress: '456 George St, Sydney NSW 2000',
          status: 'DRAFT',
          scheduledDate: new Date().toISOString().split('T')[0]!,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          code: 'APT-003',
          propertyAddress: '789 Pitt St, Sydney NSW 2000',
          status: 'DONE',
          scheduledDate: new Date().toISOString().split('T')[0]!,
        },
      ],
      pendingActions: {
        noResponseTenants: 3,
        pendingFinancialEntries: 7,
        processingReports: 1,
      },
      quickStats: {
        totalProperties: 142,
        activeInspectors: 18,
        activeServiceGroups: 4,
      },
    };
  }
}
