import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { successResponseSchema, dashboardStatsResponseSchema } from '@properfy/shared';

const mockGetDashboardStatsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: { jwtService: { verify: mockJwtVerify } },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: {
      getDashboardStatsUseCase: { execute: mockGetDashboardStatsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

const baseStats = {
  appointmentsByStatus: {
    draft: 5,
    awaitingInspector: 8,
    scheduled: 12,
    doneThisMonth: 34,
    doneThisWeek: 7,
    scheduledThisWeek: 10,
    rejectedTotal: 3,
  },
  recentAppointments: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'SPS-001',
      propertyAddress: '123 Main St, Sydney NSW 2000',
      status: 'SCHEDULED',
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      scheduledDate: '2026-03-17',
    },
  ],
  pendingActions: {
    noResponseRentalTenants: 3,
    pendingOperatorCrossChecks: 6,
    pendingFinancialEntries: 7,
    processingReports: 1,
  },
  quickStats: {
    totalProperties: 142,
    activeInspectors: 18,
    activeServiceGroups: 4,
  },
};

const inspectorBreakdowns = {
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
};

const mockStats = { ...baseStats, inspectorBreakdowns: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /v1/dashboard/stats', () => {
  it('should return 200 with dashboard stats', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetDashboardStatsExecute.mockResolvedValueOnce(mockStats);

    const res = await supertest(app.server)
      .get('/v1/dashboard/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(mockStats);
    expect(res.body.data.appointmentsByStatus.draft).toBe(5);
    expect(res.body.data.recentAppointments).toHaveLength(1);
    expect(res.body.data.pendingActions.noResponseRentalTenants).toBe(3);
    expect(res.body.data.quickStats.totalProperties).toBe(142);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get('/v1/dashboard/stats');

    expect(res.status).toBe(401);
  });

  it('should call use case with auth context', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetDashboardStatsExecute.mockResolvedValueOnce(mockStats);

    await supertest(app.server)
      .get('/v1/dashboard/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(mockGetDashboardStatsExecute).toHaveBeenCalledWith({
      actor: amContext,
    });
  });

  // T-027-502: Mandatory contract tests for the widened schema

  it('AM context: response with populated inspectorBreakdowns round-trips through dashboardStatsResponseSchema', async () => {
    const amStats = { ...baseStats, inspectorBreakdowns };
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetDashboardStatsExecute.mockResolvedValueOnce(amStats);

    const res = await supertest(app.server)
      .get('/v1/dashboard/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);

    const parseResult = successResponseSchema(dashboardStatsResponseSchema).safeParse(res.body);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      expect(parseResult.data.data.appointmentsByStatus.doneThisWeek).toBe(7);
      expect(parseResult.data.data.appointmentsByStatus.scheduledThisWeek).toBe(10);
      expect(parseResult.data.data.appointmentsByStatus.rejectedTotal).toBe(3);
      expect(parseResult.data.data.inspectorBreakdowns).not.toBeNull();
      expect(parseResult.data.data.inspectorBreakdowns?.tomorrowByInspector).toHaveLength(3);
    }
  });

  it('CL_ADMIN context: response with inspectorBreakdowns: null round-trips through dashboardStatsResponseSchema', async () => {
    const clAdminContext = {
      userId: 'user-cl-1',
      tenantId: 'tenant-uuid-0000-0000-0000-000000000001',
      role: 'CL_ADMIN',
      branchId: null,
      inspectorId: null,
    };
    const clAdminStats = { ...baseStats, inspectorBreakdowns: null };
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockGetDashboardStatsExecute.mockResolvedValueOnce(clAdminStats);

    const res = await supertest(app.server)
      .get('/v1/dashboard/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);

    const parseResult = successResponseSchema(dashboardStatsResponseSchema).safeParse(res.body);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      expect(parseResult.data.data.inspectorBreakdowns).toBeNull();
    }
  });
});
