import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import {
  successResponseSchema,
  dashboardAnalyticsResponseSchema,
  analyticsHeatmapResponseSchema,
} from '@properfy/shared';

const mockAnalyticsExecute = vi.fn();
const mockHeatmapExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      dashboard: {
        getDashboardAnalyticsUseCase: { execute: mockAnalyticsExecute },
        getAnalyticsHeatmapUseCase: { execute: mockHeatmapExecute },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const SERVICE_TYPE_ID = '11111111-1111-4111-8111-111111111111';

const analyticsPayload = {
  period: { startDate: '2026-07-01', endDate: '2026-07-31', granularity: 'day' },
  kpis: { today: 12, thisWeek: 87, thisMonth: 341, inPeriod: 341, cancelledInPeriod: 19 },
  statusInPeriod: {
    DRAFT: 4,
    AWAITING_INSPECTOR: 21,
    SCHEDULED: 60,
    DONE: 237,
    CANCELLED: 19,
    REJECTED: 0,
  },
  confirmationRate: { confirmed: 156, eligible: 200 },
  revenue: { amount: 42180.5, currency: 'AUD' },
  evolution: [{ bucketStart: '2026-07-01', count: 11 }],
  serviceTypeDistribution: [
    { serviceTypeId: SERVICE_TYPE_ID, code: 'ROUTINE', name: 'Routine Inspection', count: 180 },
  ],
  avgExecutionMinutes: [
    { serviceTypeId: SERVICE_TYPE_ID, code: 'ROUTINE', name: 'Routine Inspection', avgMinutes: 42, sampleSize: 120 },
  ],
};

const heatmapPayload = {
  points: [{ suburb: 'Newtown', lat: -33.8983, lng: 151.1793, count: 42 }],
  totalPlotted: 42,
  totalWithoutCoordinates: 3,
};

const PERIOD = { startDate: '2026-07-01', endDate: '2026-07-31' };

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
  mockTenantFindById.mockResolvedValue({ isActive: () => true, settingsJson: {} });
});

describe('GET /v1/dashboard/analytics', () => {
  it('returns 200 and the full payload round-trips through the response schema', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockAnalyticsExecute.mockResolvedValueOnce(analyticsPayload);

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    const parsed = successResponseSchema(dashboardAnalyticsResponseSchema).safeParse(res.body);
    expect(parsed.success).toBe(true);
    // A field the response schema does not declare is stripped in silence, so
    // assert the whole payload rather than a couple of spot values.
    expect(res.body.data).toEqual(analyticsPayload);
  });

  it('keeps a null revenue on the wire for the flagless CL_USER case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockAnalyticsExecute.mockResolvedValueOnce({ ...analyticsPayload, revenue: null });

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.revenue).toBeNull();
    expect(successResponseSchema(dashboardAnalyticsResponseSchema).safeParse(res.body).success).toBe(true);
  });

  it('passes the auth context and the parsed period to the use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockAnalyticsExecute.mockResolvedValueOnce(analyticsPayload);

    await supertest(app.server)
      .get('/v1/dashboard/analytics')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(mockAnalyticsExecute).toHaveBeenCalledWith({ actor: amContext, query: PERIOD });
  });

  it('resolves CL_USER permission flags onto the auth context so the revenue gate can read them', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: '22222222-2222-4222-8222-222222222222',
      role: 'CL_USER',
      branchId: null,
      inspectorId: null,
    });
    mockTenantFindById.mockResolvedValue({
      isActive: () => true,
      settingsJson: { clUserPermissions: ['view_financials'] },
    });
    mockAnalyticsExecute.mockResolvedValueOnce(analyticsPayload);

    await supertest(app.server)
      .get('/v1/dashboard/analytics')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(mockAnalyticsExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ clUserPermissions: ['view_financials'] }),
      }),
    );
  });

  it('returns 401 without an auth token', async () => {
    const res = await supertest(app.server).get('/v1/dashboard/analytics').query(PERIOD);
    expect(res.status).toBe(401);
  });

  it('rejects a malformed date without reaching the use case', async () => {
    mockJwtVerify.mockResolvedValue(amContext);

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics')
      .query({ startDate: '01/07/2026', endDate: '2026-07-31' })
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(mockAnalyticsExecute).not.toHaveBeenCalled();
  });

  it('rejects an inverted period without reaching the use case', async () => {
    mockJwtVerify.mockResolvedValue(amContext);

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics')
      .query({ startDate: '2026-07-31', endDate: '2026-07-01' })
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(mockAnalyticsExecute).not.toHaveBeenCalled();
  });
});

describe('GET /v1/dashboard/analytics/heatmap', () => {
  it('returns 200 and round-trips through the heatmap schema', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockHeatmapExecute.mockResolvedValueOnce(heatmapPayload);

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics/heatmap')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(successResponseSchema(analyticsHeatmapResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data).toEqual(heatmapPayload);
  });

  it('keeps the ungeocoded tally on the wire so the map can disclose what it dropped', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockHeatmapExecute.mockResolvedValueOnce(heatmapPayload);

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics/heatmap')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(res.body.data.totalWithoutCoordinates).toBe(3);
  });

  it('returns an empty heatmap without a serializer failure', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockHeatmapExecute.mockResolvedValueOnce({ points: [], totalPlotted: 0, totalWithoutCoordinates: 0 });

    const res = await supertest(app.server)
      .get('/v1/dashboard/analytics/heatmap')
      .query(PERIOD)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.points).toEqual([]);
  });

  it('returns 401 without an auth token', async () => {
    const res = await supertest(app.server).get('/v1/dashboard/analytics/heatmap').query(PERIOD);
    expect(res.status).toBe(401);
  });
});
