import {
  AppointmentStatus,
  TenantConfirmationStatus,
  FinancialEntryStatus,
  ReportStatus,
  InspectorStatus,
  ServiceGroupStatus,
} from '@properfy/shared';
import type { DashboardStats } from '../types';
import { MOCK_APPOINTMENTS } from '@/features/appointments/mocks/appointments';
import { MOCK_TENANT_CONTACTS } from '@/features/tenants/mocks/tenantContacts';
import { MOCK_FINANCIAL_ENTRIES } from '@/features/financial/mocks/financialEntries';
import { MOCK_REPORTS } from '@/features/reports/mocks/reports';
import { MOCK_PROPERTIES } from '@/features/properties/mocks/properties';
import { MOCK_INSPECTORS } from '@/features/inspectors/mocks/inspectors';
import { MOCK_SERVICE_GROUPS } from '@/features/service-groups/mocks/service-groups';

const recentAppointments = [...MOCK_APPOINTMENTS]
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .slice(0, 5)
  .map((apt) => ({
    id: apt.id,
    code: apt.code,
    propertyAddress: apt.propertyAddress,
    status: apt.status,
    scheduledDate: apt.scheduledDate,
  }));

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  appointmentsByStatus: {
    draft: MOCK_APPOINTMENTS.filter((a) => a.status === AppointmentStatus.DRAFT).length,
    awaitingInspector: MOCK_APPOINTMENTS.filter(
      (a) => a.status === AppointmentStatus.AWAITING_INSPECTOR,
    ).length,
    scheduled: MOCK_APPOINTMENTS.filter((a) => a.status === AppointmentStatus.SCHEDULED).length,
    doneThisMonth: MOCK_APPOINTMENTS.filter((a) => a.status === AppointmentStatus.DONE).length,
  },
  recentAppointments,
  pendingActions: {
    noResponseTenants: MOCK_TENANT_CONTACTS.filter(
      (t) => t.confirmationStatus === TenantConfirmationStatus.NO_RESPONSE,
    ).length,
    pendingFinancialEntries: MOCK_FINANCIAL_ENTRIES.filter(
      (f) => f.status === FinancialEntryStatus.PENDING,
    ).length,
    processingReports: MOCK_REPORTS.filter((r) => r.status === ReportStatus.PROCESSING).length,
  },
  quickStats: {
    totalProperties: MOCK_PROPERTIES.length,
    activeInspectors: MOCK_INSPECTORS.filter((i) => i.status === InspectorStatus.ACTIVE).length,
    activeServiceGroups: MOCK_SERVICE_GROUPS.filter(
      (sg) =>
        sg.status === ServiceGroupStatus.PUBLISHED || sg.status === ServiceGroupStatus.ACCEPTED,
    ).length,
  },
};
