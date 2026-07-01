import type { AppointmentStatus } from '@properfy/shared';

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

export interface DashboardStats {
  appointmentsByStatus: {
    draft: number;
    awaitingInspector: number;
    scheduled: number;
    doneThisMonth: number;
    doneThisWeek: number;
    scheduledThisWeek: number;
    rejectedTotal: number;
  };
  recentAppointments: RecentAppointment[];
  pendingActions: PendingActions;
  quickStats: QuickStats;
  inspectorBreakdowns: InspectorBreakdowns | null;
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
  noResponseRentalTenants: number;
  pendingOperatorCrossChecks: number;
  pendingFinancialEntries: number;
  processingReports: number;
}

export interface QuickStats {
  totalProperties: number;
  activeInspectors: number;
  activeServiceGroups: number;
}
