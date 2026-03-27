import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

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
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
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

const mockStats = {
  appointmentsByStatus: {
    draft: 5,
    awaitingInspector: 8,
    scheduled: 12,
    doneThisMonth: 34,
  },
  recentAppointments: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'SPS-001',
      propertyAddress: '123 Main St, Sydney NSW 2000',
      status: 'SCHEDULED',
      doneCheckedByUserId: null,
      scheduledDate: '2026-03-17',
    },
  ],
  pendingActions: {
    noResponseTenants: 3,
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
    expect(res.body.data.pendingActions.noResponseTenants).toBe(3);
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
});
