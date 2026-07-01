import { describe, it, expect } from 'vitest';
import {
  loginResponseSchema,
  refreshResponseSchema,
  meResponseSchema,
  portalDataResponseSchema,
  dashboardStatsResponseSchema,
  inspectorDayCountSchema,
  inspectorAppointmentDetailResponseSchema,
} from './responses';

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
