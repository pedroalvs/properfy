import { describe, it, expect } from 'vitest';
import {
  loginResponseSchema,
  refreshResponseSchema,
  meResponseSchema,
  portalDataResponseSchema,
  dashboardStatsResponseSchema,
  inspectorDayCountSchema,
  agencyFinancialExportResponseSchema,
  inspectorAppointmentDetailResponseSchema,
  inspectorScheduleMonthResponseSchema,
  appointmentResponseSchema,
  inspectorEarningsSummaryResponseSchema,
} from './responses';

describe('appointmentResponseSchema — appointmentCode / code', () => {
  const validBase = {
    id: '4f6b0f66-3f43-4b0a-9c67-3a2b1f2ee111',
    tenantId: '4f6b0f66-3f43-4b0a-9c67-3a2b1f2ee112',
    branchId: '4f6b0f66-3f43-4b0a-9c67-3a2b1f2ee113',
    propertyId: '4f6b0f66-3f43-4b0a-9c67-3a2b1f2ee114',
    serviceTypeId: '4f6b0f66-3f43-4b0a-9c67-3a2b1f2ee115',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: '2026-07-10',
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 80,
    notes: null,
    createdByUserId: '4f6b0f66-3f43-4b0a-9c67-3a2b1f2ee116',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('accepts appointmentCode when present (detail endpoint)', () => {
    const result = appointmentResponseSchema.safeParse({ ...validBase, appointmentCode: 'INS-0058' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.appointmentCode).toBe('INS-0058');
  });

  it('accepts code when present (list endpoint alias)', () => {
    const result = appointmentResponseSchema.safeParse({ ...validBase, code: 'INS-0058' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe('INS-0058');
  });

  it('accepts omission of both optional fields', () => {
    const result = appointmentResponseSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appointmentCode).toBeUndefined();
      expect(result.data.code).toBeUndefined();
    }
  });

  it('rejects non-string appointmentCode / code', () => {
    expect(appointmentResponseSchema.safeParse({ ...validBase, appointmentCode: 58 }).success).toBe(false);
    expect(appointmentResponseSchema.safeParse({ ...validBase, code: 58 }).success).toBe(false);
  });
});

describe('agencyFinancialExportResponseSchema (031)', () => {
  it('accepts a base64 XLSX payload', () => {
    const result = agencyFinancialExportResponseSchema.safeParse({
      filename: 'financial-statement.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: 'WExTWA==',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload missing contentBase64', () => {
    const result = agencyFinancialExportResponseSchema.safeParse({
      filename: 'x.xlsx',
      contentType: 'application/octet-stream',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginResponseSchema', () => {
  const validLogin = {
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
    user: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Test User',
      email: 'test@example.com',
      role: 'CL_ADMIN',
      tenantId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
    },
  };

  it('should accept valid login response', () => {
    const result = loginResponseSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
  });

  it('should accept null tenantId', () => {
    const result = loginResponseSchema.safeParse({
      ...validLogin,
      user: { ...validLogin.user, tenantId: null },
    });
    expect(result.success).toBe(true);
  });

  it('should not require expiresIn', () => {
    const result = loginResponseSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('expiresIn');
    }
  });
});

describe('inspectorScheduleMonthResponseSchema', () => {
  const appointment = {
    id: '00000000-0000-0000-0000-000000000001',
    appointmentCode: 'INS-0001',
    status: 'SCHEDULED',
    scheduledDate: '2026-03-21',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    serviceTypeId: '00000000-0000-0000-0000-000000000002',
    propertyId: '00000000-0000-0000-0000-000000000003',
    propertyAddress: '1 Test St, Sydney NSW 2000',
    suburb: 'Sydney',
    serviceTypeName: 'Routine Inspection',
    flowType: 'ROUTINE',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    keyRequired: false,
    meetingLocation: null,
    executionStatus: 'NOT_STARTED',
    agencyName: 'Test Agency',
  };

  it('accepts the monthly schedule payload used by the PWA schedule screen', () => {
    const result = inspectorScheduleMonthResponseSchema.safeParse({
      today: '2026-03-21',
      from: '2026-03-21',
      to: '2026-04-20',
      days: [{ date: '2026-03-21', count: 1, hasUrgent: false }],
      appointments: [appointment],
      overdueAppointments: [{ ...appointment, scheduledDate: '2026-03-20', isOverdue: true }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects appointments without card summary fields', () => {
    const result = inspectorScheduleMonthResponseSchema.safeParse({
      today: '2026-03-21',
      from: '2026-03-21',
      to: '2026-04-20',
      days: [{ date: '2026-03-21', count: 1, hasUrgent: false }],
      appointments: [{ ...appointment, propertyAddress: undefined }],
      overdueAppointments: [],
    });

    expect(result.success).toBe(false);
  });
});

describe('refreshResponseSchema', () => {
  const validRefresh = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
  };

  it('should accept valid refresh response', () => {
    const result = refreshResponseSchema.safeParse(validRefresh);
    expect(result.success).toBe(true);
  });

  it('should not require expiresIn', () => {
    const result = refreshResponseSchema.safeParse(validRefresh);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('expiresIn');
    }
  });
});

describe('meResponseSchema', () => {
  const validMe = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Test User',
    email: 'test@example.com',
    role: 'AM',
    tenantId: null,
    branchId: null,
    totpEnabled: true,
    phone: '+61412345678',
    status: 'ACTIVE',
    lastLoginAt: '2026-03-17T10:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('should accept valid me response with all fields', () => {
    const result = meResponseSchema.safeParse(validMe);
    expect(result.success).toBe(true);
  });

  it('should accept null phone and lastLoginAt', () => {
    const result = meResponseSchema.safeParse({
      ...validMe,
      phone: null,
      lastLoginAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing phone field', () => {
    const { phone: _phone, ...without } = validMe;
    const result = meResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('should reject missing status field', () => {
    const { status: _status, ...without } = validMe;
    const result = meResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('should reject missing createdAt field', () => {
    const { createdAt: _createdAt, ...without } = validMe;
    const result = meResponseSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('should retain clUserPermissions when present (031)', () => {
    const result = meResponseSchema.safeParse({
      ...validMe,
      role: 'CL_USER',
      tenantId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
      clUserPermissions: ['view_financials', 'create_appointments'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clUserPermissions).toEqual(['view_financials', 'create_appointments']);
    }
  });

  it('should accept a me response without clUserPermissions (optional, 031)', () => {
    const result = meResponseSchema.safeParse(validMe);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clUserPermissions).toBeUndefined();
    }
  });

  it('should reject clUserPermissions with non-string elements (031)', () => {
    const result = meResponseSchema.safeParse({ ...validMe, clUserPermissions: [123, 'view_financials'] });
    expect(result.success).toBe(false);
  });
});

describe('portalDataResponseSchema', () => {
  it('should accept restrictions as object', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, isExpired: false, canRequestNewLink: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: { isHome: true, notes: 'Ring bell' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept restrictions as null', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, isExpired: false, canRequestNewLink: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept missing restrictions (defaults to undefined)', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, isExpired: false, canRequestNewLink: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept expired token with canRequestNewLink flag', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'EXPIRED', isReadOnly: true, isExpired: true, canRequestNewLink: true, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject token missing isExpired flag', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject token missing canRequestNewLink flag', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, isExpired: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
    });
    expect(result.success).toBe(false);
  });

  it('should accept existingResponse metadata when present', () => {
    const result = portalDataResponseSchema.safeParse({
      token: { status: 'ACTIVE', isReadOnly: false, isExpired: false, canRequestNewLink: false, expiresAt: '2026-04-01T00:00:00.000Z' },
      appointment: { id: '123' },
      contact: null,
      restrictions: null,
      existingResponse: {
        type: 'CONFIRMED',
        createdAt: '2026-03-20T10:00:00.000Z',
        summary: 'Tenant confirmed attendance',
      },
    });
    expect(result.success).toBe(true);
  });
});

// ─── T-027-102: dashboardStatsResponseSchema — new fields ─────────────────

const amPayload = {
  appointmentsByStatus: {
    draft: 5,
    awaitingInspector: 8,
    scheduled: 12,
    doneThisMonth: 34,
    doneThisWeek: 7,
    scheduledThisWeek: 10,
    rejectedTotal: 3,
  },
  recentAppointments: [],
  pendingActions: {
    noResponseRentalTenants: 1,
    pendingOperatorCrossChecks: 2,
    pendingFinancialEntries: 3,
    processingReports: 0,
  },
  quickStats: {
    totalProperties: 100,
    activeInspectors: 10,
    activeServiceGroups: 5,
  },
  inspectorBreakdowns: {
    tomorrowByInspector: [
      { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 18, alertLevel: 'red' },
      { inspectorId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22', inspectorName: 'Bob', count: 15, alertLevel: 'yellow' },
      { inspectorId: 'c2ccde11-1b2d-4ef0-dd8f-8dd1df502c33', inspectorName: 'Charlie', count: 3, alertLevel: null },
    ],
    scheduledThisWeekByInspector: [
      { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 25, alertLevel: null },
    ],
    confirmedThisWeekByInspector: [
      { inspectorId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22', inspectorName: 'Bob', count: 12, alertLevel: null },
    ],
  },
};

const clAdminPayload = {
  ...amPayload,
  inspectorBreakdowns: null,
};

describe('dashboardStatsResponseSchema — 027 new fields', () => {
  it('parses a fully-populated AM-shaped payload', () => {
    const result = dashboardStatsResponseSchema.safeParse(amPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appointmentsByStatus.doneThisWeek).toBe(7);
      expect(result.data.appointmentsByStatus.scheduledThisWeek).toBe(10);
      expect(result.data.appointmentsByStatus.rejectedTotal).toBe(3);
      expect(result.data.inspectorBreakdowns?.tomorrowByInspector).toHaveLength(3);
    }
  });

  it('parses a CL_ADMIN-shaped payload with inspectorBreakdowns: null', () => {
    const result = dashboardStatsResponseSchema.safeParse(clAdminPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inspectorBreakdowns).toBeNull();
    }
  });

  it('rejects a payload missing inspectorBreakdowns entirely', () => {
    const { inspectorBreakdowns: _omit, ...withoutBreakdowns } = amPayload;
    const result = dashboardStatsResponseSchema.safeParse(withoutBreakdowns);
    expect(result.success).toBe(false);
  });

  it('rejects an alertLevel outside the enum', () => {
    const invalidPayload = {
      ...amPayload,
      inspectorBreakdowns: {
        ...amPayload.inspectorBreakdowns,
        tomorrowByInspector: [
          { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 18, alertLevel: 'orange' },
        ],
      },
    };
    const result = dashboardStatsResponseSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});

describe('inspectorDayCountSchema', () => {
  it('accepts a valid row with alertLevel null', () => {
    const result = inspectorDayCountSchema.safeParse({
      inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      inspectorName: 'Alice',
      count: 5,
      alertLevel: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts alertLevel yellow', () => {
    const result = inspectorDayCountSchema.safeParse({
      inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      inspectorName: 'Alice',
      count: 15,
      alertLevel: 'yellow',
    });
    expect(result.success).toBe(true);
  });

  it('accepts alertLevel red', () => {
    const result = inspectorDayCountSchema.safeParse({
      inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      inspectorName: 'Alice',
      count: 18,
      alertLevel: 'red',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative count', () => {
    const result = inspectorDayCountSchema.safeParse({
      inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      inspectorName: 'Alice',
      count: -1,
      alertLevel: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID inspectorId', () => {
    const result = inspectorDayCountSchema.safeParse({
      inspectorId: 'not-a-uuid',
      inspectorName: 'Alice',
      count: 5,
      alertLevel: null,
    });
    expect(result.success).toBe(false);
  });
});

describe('inspectorAppointmentDetailResponseSchema — customFields', () => {
  const validBase = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    status: 'SCHEDULED',
    scheduledDate: '2027-06-15',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    serviceTypeId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
    serviceTypeName: 'Routine Inspection',
    flowType: 'ROUTINE',
    propertyId: 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33',
    propertyAddress: '123 Main St',
    suburb: 'Brunswick',
    propertyLatitude: null,
    propertyLongitude: null,
    rentalTenantConfirmationStatus: 'PENDING',
    rentalTenantConfirmation: 'PENDING',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantName: 'John Tenant',
    rentalTenantPhone: null,
    rentalTenantEmail: null,
    notes: null,
    observation: null,
    restrictionsSummary: null,
    contact: null,
    restrictions: [],
    execution: null,
    assets: [],
    apps: [],
  };

  it('accepts a valid customFields array', () => {
    const result = inspectorAppointmentDetailResponseSchema.safeParse({
      ...validBase,
      customFields: [
        { label: 'Gate code', value: '1234' },
        { label: 'Parking', value: 'Level 2' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty customFields array and an omitted field', () => {
    expect(inspectorAppointmentDetailResponseSchema.safeParse({ ...validBase, customFields: [] }).success).toBe(true);
    expect(inspectorAppointmentDetailResponseSchema.safeParse(validBase).success).toBe(true);
  });

  it('rejects malformed customFields entries (wrong types)', () => {
    const result = inspectorAppointmentDetailResponseSchema.safeParse({
      ...validBase,
      customFields: [{ label: 123, value: true }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-array customFields', () => {
    const result = inspectorAppointmentDetailResponseSchema.safeParse({
      ...validBase,
      customFields: { label: 'Gate', value: '1' },
    });
    expect(result.success).toBe(false);
  });
});

describe('inspectorAppointmentDetailResponseSchema — jobDetails.tenantContacts enrichment', () => {
  const validBase = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    status: 'SCHEDULED',
    scheduledDate: '2027-06-15',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    serviceTypeId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22',
    serviceTypeName: 'Routine Inspection',
    flowType: 'ROUTINE',
    propertyId: 'c2ddfe22-2b3c-4ef9-cc7e-7cc0ce491b33',
    propertyAddress: '123 Main St',
    suburb: 'Brunswick',
    propertyLatitude: null,
    propertyLongitude: null,
    rentalTenantConfirmationStatus: 'PENDING',
    rentalTenantConfirmation: 'PENDING',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantName: 'John Tenant',
    rentalTenantPhone: null,
    rentalTenantEmail: null,
    notes: null,
    observation: null,
    restrictionsSummary: null,
    contact: null,
    restrictions: [],
    execution: null,
    assets: [],
    apps: [],
  };

  const jobDetailsBase = {
    agency: { id: 't1', name: 'Agency One' },
    keys: { keyRequired: false, keyLocation: null },
    propertyManager: null,
    payment: { payoutAmount: 80, currency: 'AUD' },
  };

  it('accepts legacy tenantContacts entries without the enrichment fields', () => {
    const result = inspectorAppointmentDetailResponseSchema.safeParse({
      ...validBase,
      jobDetails: {
        ...jobDetailsBase,
        tenantContacts: [
          { name: 'John Tenant', email: null, phone: '0400000000', role: 'RENTAL_TENANT', isPrimary: true },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts enriched entries with type, company and additionalChannels', () => {
    const result = inspectorAppointmentDetailResponseSchema.safeParse({
      ...validBase,
      jobDetails: {
        ...jobDetailsBase,
        tenantContacts: [
          {
            name: 'Jane Rep',
            email: 'jane@x.com',
            phone: null,
            role: 'RENTAL_TENANT_REPRESENTATIVE',
            isPrimary: false,
            type: 'INDIVIDUAL',
            company: 'Acme Realty',
            additionalChannels: [
              { channel: 'PHONE', value: '0411111111', label: 'Work' },
              { channel: 'EMAIL', value: 'alt@x.com' },
            ],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed additionalChannels entries', () => {
    const result = inspectorAppointmentDetailResponseSchema.safeParse({
      ...validBase,
      jobDetails: {
        ...jobDetailsBase,
        tenantContacts: [
          {
            name: 'Jane', email: null, phone: null, role: 'OTHER', isPrimary: true,
            additionalChannels: [{ channel: 1, value: false }],
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('inspectorEarningsSummaryResponseSchema', () => {
  const valid = {
    currency: 'AUD',
    totalApproved: 1500.5,
    nextPayment: 250,
    monthly: [
      { month: '2026-06', total: 500 },
      { month: '2026-07', total: 1000.5 },
    ],
  };

  it('accepts a valid payload', () => {
    expect(inspectorEarningsSummaryResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null currency with an empty monthly array', () => {
    const result = inspectorEarningsSummaryResponseSchema.safeParse({
      currency: null,
      totalApproved: 0,
      nextPayment: 0,
      monthly: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a month key that is not YYYY-MM', () => {
    const result = inspectorEarningsSummaryResponseSchema.safeParse({
      ...valid,
      monthly: [{ month: '2026-7', total: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range month (00 or 13)', () => {
    for (const month of ['2026-00', '2026-13']) {
      const result = inspectorEarningsSummaryResponseSchema.safeParse({
        ...valid,
        monthly: [{ month, total: 1 }],
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects a missing totalApproved', () => {
    const { totalApproved: _totalApproved, ...rest } = valid;
    expect(inspectorEarningsSummaryResponseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-numeric monthly total', () => {
    const result = inspectorEarningsSummaryResponseSchema.safeParse({
      ...valid,
      monthly: [{ month: '2026-06', total: '500' }],
    });
    expect(result.success).toBe(false);
  });
});
