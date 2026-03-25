import type { AppointmentStatus } from '@properfy/shared';

export interface DashboardStats {
  appointmentsByStatus: {
    draft: number;
    awaitingInspector: number;
    scheduled: number;
    doneThisMonth: number;
  };
  recentAppointments: RecentAppointment[];
  pendingActions: PendingActions;
  quickStats: QuickStats;
}

export interface RecentAppointment {
  id: string;
  code: string;
  propertyAddress: string;
  status: AppointmentStatus;
  doneCheckedByUserId?: string | null;
  scheduledDate: string;
}

export interface PendingActions {
  noResponseTenants: number;
  pendingOperatorCrossChecks: number;
  pendingFinancialEntries: number;
  processingReports: number;
}

export interface QuickStats {
  totalProperties: number;
  activeInspectors: number;
  activeServiceGroups: number;
}
