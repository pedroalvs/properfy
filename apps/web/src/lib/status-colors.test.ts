import { describe, it, expect } from 'vitest';
import { AppointmentStatus, PropertyType, InspectorStatus, ServiceGroupStatus, PriorityMode, UserRole, UserStatus, FinancialEntryType, FinancialEntryStatus, TenantConfirmationStatus, ReportType, ReportStatus, ServiceTypeFlowType, ServiceTypeStatus, AvailabilitySlotStatus } from '@properfy/shared';
import { APPOINTMENT_STATUS_MAP, getStatusStyle, PROPERTY_TYPE_MAP, INSPECTOR_STATUS_MAP, SERVICE_GROUP_STATUS_MAP, PRIORITY_MODE_MAP, USER_ROLE_MAP, USER_STATUS_MAP, FINANCIAL_ENTRY_TYPE_MAP, FINANCIAL_ENTRY_STATUS_MAP, TENANT_CONFIRMATION_STATUS_MAP, REPORT_TYPE_MAP, REPORT_STATUS_MAP, FLOW_TYPE_MAP, SERVICE_TYPE_STATUS_MAP, SLOT_STATUS_MAP } from './status-colors';

describe('APPOINTMENT_STATUS_MAP', () => {
  const allStatuses: AppointmentStatus[] = [
    AppointmentStatus.DRAFT,
    AppointmentStatus.AWAITING_INSPECTOR,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.DONE,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.REJECTED,
  ];

  it('maps all 6 appointment statuses', () => {
    expect(Object.keys(APPOINTMENT_STATUS_MAP)).toHaveLength(6);
    for (const status of allStatuses) {
      expect(APPOINTMENT_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = APPOINTMENT_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.DRAFT].label).toBe('Draft');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.AWAITING_INSPECTOR].label).toBe('Awaiting Inspector');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.SCHEDULED].label).toBe('Scheduled');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.DONE].label).toBe('Done');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.CANCELLED].label).toBe('Cancelled');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.REJECTED].label).toBe('Rejected');
  });

  it('getStatusStyle returns the correct style', () => {
    const style = getStatusStyle(AppointmentStatus.DONE);
    expect(style.bg).toBe('var(--color-status-done)');
    expect(style.label).toBe('Done');
  });
});

describe('PROPERTY_TYPE_MAP', () => {
  const allTypes: PropertyType[] = [
    PropertyType.RESIDENTIAL,
    PropertyType.COMMERCIAL,
    PropertyType.INDUSTRIAL,
    PropertyType.RURAL,
  ];

  it('maps all 4 property types', () => {
    expect(Object.keys(PROPERTY_TYPE_MAP)).toHaveLength(4);
    for (const type of allTypes) {
      expect(PROPERTY_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = PROPERTY_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(PROPERTY_TYPE_MAP[PropertyType.RESIDENTIAL].label).toBe('Residential');
    expect(PROPERTY_TYPE_MAP[PropertyType.COMMERCIAL].label).toBe('Commercial');
    expect(PROPERTY_TYPE_MAP[PropertyType.INDUSTRIAL].label).toBe('Industrial');
    expect(PROPERTY_TYPE_MAP[PropertyType.RURAL].label).toBe('Rural');
  });
});

describe('INSPECTOR_STATUS_MAP', () => {
  const allStatuses: InspectorStatus[] = [
    InspectorStatus.ACTIVE,
    InspectorStatus.INACTIVE,
  ];

  it('maps both inspector statuses', () => {
    expect(Object.keys(INSPECTOR_STATUS_MAP)).toHaveLength(2);
    for (const status of allStatuses) {
      expect(INSPECTOR_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = INSPECTOR_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(INSPECTOR_STATUS_MAP[InspectorStatus.ACTIVE].label).toBe('Active');
    expect(INSPECTOR_STATUS_MAP[InspectorStatus.INACTIVE].label).toBe('Inactive');
  });
});

describe('SERVICE_GROUP_STATUS_MAP', () => {
  const allStatuses: ServiceGroupStatus[] = [
    ServiceGroupStatus.DRAFT,
    ServiceGroupStatus.PUBLISHED,
    ServiceGroupStatus.ACCEPTED,
    ServiceGroupStatus.CANCELLED,
    ServiceGroupStatus.REJECTED,
  ];

  it('maps all 5 service group statuses', () => {
    expect(Object.keys(SERVICE_GROUP_STATUS_MAP)).toHaveLength(5);
    for (const status of allStatuses) {
      expect(SERVICE_GROUP_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = SERVICE_GROUP_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.DRAFT].label).toBe('Awaiting Host');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.PUBLISHED].label).toBe('Awaiting Inspector');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.ACCEPTED].label).toBe('Accepted');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.CANCELLED].label).toBe('Canceled');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.REJECTED].label).toBe('Rejected');
  });
});

describe('PRIORITY_MODE_MAP', () => {
  const allModes: PriorityMode[] = [
    PriorityMode.STANDARD,
    PriorityMode.PRIORITY_24H,
  ];

  it('maps both priority modes', () => {
    expect(Object.keys(PRIORITY_MODE_MAP)).toHaveLength(2);
    for (const mode of allModes) {
      expect(PRIORITY_MODE_MAP[mode]).toBeDefined();
    }
  });

  it.each(allModes)('mode %s has bg, text, and label', (mode) => {
    const style = PRIORITY_MODE_MAP[mode];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(PRIORITY_MODE_MAP[PriorityMode.STANDARD].label).toBe('Standard');
    expect(PRIORITY_MODE_MAP[PriorityMode.PRIORITY_24H].label).toBe('24h Priority');
  });
});

describe('USER_ROLE_MAP', () => {
  const allRoles: UserRole[] = [
    UserRole.AM,
    UserRole.OP,
    UserRole.CL_ADMIN,
    UserRole.CL_USER,
    UserRole.INSP,
    UserRole.TNT,
    UserRole.SYS,
  ];

  it('maps all 7 user roles', () => {
    expect(Object.keys(USER_ROLE_MAP)).toHaveLength(7);
    for (const role of allRoles) {
      expect(USER_ROLE_MAP[role]).toBeDefined();
    }
  });

  it.each(allRoles)('role %s has bg, text, and label', (role) => {
    const style = USER_ROLE_MAP[role];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(USER_ROLE_MAP[UserRole.AM].label).toBe('Admin Master');
    expect(USER_ROLE_MAP[UserRole.OP].label).toBe('Operator');
    expect(USER_ROLE_MAP[UserRole.CL_ADMIN].label).toBe('Client Admin');
    expect(USER_ROLE_MAP[UserRole.CL_USER].label).toBe('Client User');
    expect(USER_ROLE_MAP[UserRole.INSP].label).toBe('Inspector');
    expect(USER_ROLE_MAP[UserRole.TNT].label).toBe('Tenant');
  });
});

describe('USER_STATUS_MAP', () => {
  const allStatuses: UserStatus[] = [
    UserStatus.ACTIVE,
    UserStatus.INACTIVE,
    UserStatus.LOCKED,
    UserStatus.PENDING_INVITE,
  ];

  it('maps all 4 user statuses', () => {
    expect(Object.keys(USER_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(USER_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = USER_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(USER_STATUS_MAP[UserStatus.ACTIVE].label).toBe('Active');
    expect(USER_STATUS_MAP[UserStatus.INACTIVE].label).toBe('Inactive');
    expect(USER_STATUS_MAP[UserStatus.LOCKED].label).toBe('Blocked');
  });
});

describe('FINANCIAL_ENTRY_TYPE_MAP', () => {
  const allTypes: FinancialEntryType[] = [
    FinancialEntryType.TENANT_DEBIT,
    FinancialEntryType.INSPECTOR_PAYOUT,
    FinancialEntryType.REFUND,
    FinancialEntryType.MANUAL_ADJUSTMENT,
  ];

  it('maps all 4 financial entry types', () => {
    expect(Object.keys(FINANCIAL_ENTRY_TYPE_MAP)).toHaveLength(4);
    for (const type of allTypes) {
      expect(FINANCIAL_ENTRY_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = FINANCIAL_ENTRY_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in English', () => {
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.TENANT_DEBIT].label).toBe('Tenant Debit');
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.INSPECTOR_PAYOUT].label).toBe('Inspector Payout');
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.REFUND].label).toBe('Refund');
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.MANUAL_ADJUSTMENT].label).toBe('Manual Adjustment');
  });
});

describe('FINANCIAL_ENTRY_STATUS_MAP', () => {
  const allStatuses: FinancialEntryStatus[] = [
    FinancialEntryStatus.PENDING,
    FinancialEntryStatus.APPROVED,
    FinancialEntryStatus.CANCELLED,
    FinancialEntryStatus.VOIDED,
  ];

  it('maps all 4 financial entry statuses', () => {
    expect(Object.keys(FINANCIAL_ENTRY_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(FINANCIAL_ENTRY_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = FINANCIAL_ENTRY_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in English', () => {
    expect(FINANCIAL_ENTRY_STATUS_MAP[FinancialEntryStatus.PENDING].label).toBe('Pending');
    expect(FINANCIAL_ENTRY_STATUS_MAP[FinancialEntryStatus.APPROVED].label).toBe('Approved');
    expect(FINANCIAL_ENTRY_STATUS_MAP[FinancialEntryStatus.CANCELLED].label).toBe('Cancelled');
  });
});

describe('TENANT_CONFIRMATION_STATUS_MAP', () => {
  const allStatuses: TenantConfirmationStatus[] = [
    TenantConfirmationStatus.PENDING,
    TenantConfirmationStatus.CONFIRMED,
    TenantConfirmationStatus.UNAVAILABLE,
    TenantConfirmationStatus.NO_RESPONSE,
  ];

  it('maps all 4 tenant confirmation statuses', () => {
    expect(Object.keys(TENANT_CONFIRMATION_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(TENANT_CONFIRMATION_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = TENANT_CONFIRMATION_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.PENDING].label).toBe('Pending');
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.CONFIRMED].label).toBe('Confirmed');
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.UNAVAILABLE].label).toBe('Unavailable');
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.NO_RESPONSE].label).toBe('No Response');
  });
});

describe('REPORT_TYPE_MAP', () => {
  const allTypes: ReportType[] = [
    ReportType.INSPECTIONS_SCHEDULED,
    ReportType.INSPECTIONS_DONE,
    ReportType.INSPECTIONS_CANCELLED,
    ReportType.INSPECTIONS_REJECTED,
    ReportType.INSPECTOR_PERFORMANCE,
    ReportType.CONFIRMATION_STATUS,
    ReportType.FINANCIAL_SERVICES,
  ];

  it('maps all 7 report types', () => {
    expect(Object.keys(REPORT_TYPE_MAP)).toHaveLength(7);
    for (const type of allTypes) {
      expect(REPORT_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = REPORT_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_SCHEDULED].label).toBe('Scheduled Inspections');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_DONE].label).toBe('Completed Inspections');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_CANCELLED].label).toBe('Cancelled Inspections');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_REJECTED].label).toBe('Rejected Inspections');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTOR_PERFORMANCE].label).toBe('Inspector Performance');
    expect(REPORT_TYPE_MAP[ReportType.CONFIRMATION_STATUS].label).toBe('Confirmation Status');
    expect(REPORT_TYPE_MAP[ReportType.FINANCIAL_SERVICES].label).toBe('Financial Services');
  });
});

describe('REPORT_STATUS_MAP', () => {
  const allStatuses: ReportStatus[] = [
    ReportStatus.PENDING,
    ReportStatus.PROCESSING,
    ReportStatus.READY,
    ReportStatus.FAILED,
  ];

  it('maps all 4 report statuses', () => {
    expect(Object.keys(REPORT_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(REPORT_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = REPORT_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(REPORT_STATUS_MAP[ReportStatus.PENDING].label).toBe('Pending');
    expect(REPORT_STATUS_MAP[ReportStatus.PROCESSING].label).toBe('Processing');
    expect(REPORT_STATUS_MAP[ReportStatus.READY].label).toBe('Ready');
    expect(REPORT_STATUS_MAP[ReportStatus.FAILED].label).toBe('Failed');
  });
});

describe('FLOW_TYPE_MAP', () => {
  const allTypes: ServiceTypeFlowType[] = [
    ServiceTypeFlowType.ROUTINE,
    ServiceTypeFlowType.INGOING,
    ServiceTypeFlowType.OUTGOING,
  ];

  it('maps all 3 flow types', () => {
    expect(Object.keys(FLOW_TYPE_MAP)).toHaveLength(3);
    for (const type of allTypes) {
      expect(FLOW_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = FLOW_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(FLOW_TYPE_MAP[ServiceTypeFlowType.ROUTINE].label).toBe('Routine');
    expect(FLOW_TYPE_MAP[ServiceTypeFlowType.INGOING].label).toBe('Ingoing');
    expect(FLOW_TYPE_MAP[ServiceTypeFlowType.OUTGOING].label).toBe('Outgoing');
  });
});

describe('SERVICE_TYPE_STATUS_MAP', () => {
  const allStatuses: ServiceTypeStatus[] = [
    ServiceTypeStatus.ACTIVE,
    ServiceTypeStatus.INACTIVE,
  ];

  it('maps both service type statuses', () => {
    expect(Object.keys(SERVICE_TYPE_STATUS_MAP)).toHaveLength(2);
    for (const status of allStatuses) {
      expect(SERVICE_TYPE_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = SERVICE_TYPE_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(SERVICE_TYPE_STATUS_MAP[ServiceTypeStatus.ACTIVE].label).toBe('Active');
    expect(SERVICE_TYPE_STATUS_MAP[ServiceTypeStatus.INACTIVE].label).toBe('Inactive');
  });
});

describe('SLOT_STATUS_MAP', () => {
  const allStatuses: AvailabilitySlotStatus[] = [
    AvailabilitySlotStatus.AVAILABLE,
    AvailabilitySlotStatus.BOOKED,
    AvailabilitySlotStatus.CANCELLED,
  ];

  it('maps all 3 slot statuses', () => {
    expect(Object.keys(SLOT_STATUS_MAP)).toHaveLength(3);
    for (const status of allStatuses) {
      expect(SLOT_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = SLOT_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels', () => {
    expect(SLOT_STATUS_MAP[AvailabilitySlotStatus.AVAILABLE].label).toBe('Available');
    expect(SLOT_STATUS_MAP[AvailabilitySlotStatus.BOOKED].label).toBe('Booked');
    expect(SLOT_STATUS_MAP[AvailabilitySlotStatus.CANCELLED].label).toBe('Cancelled');
  });
});
