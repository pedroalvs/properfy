import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockSummary = vi.fn();
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
    inspectorExecution: {
      getInspectorEarningsSummaryUseCase: { execute: mockSummary },
      jwtService: { verify: mockJwtVerify },
    },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const inspContext = { userId: 'insp-1', tenantId: 'tenant-1', role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const opContext = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };
const inspNotLinked = { userId: 'insp-x', tenantId: 'tenant-1', role: 'INSP', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('GET /v1/inspector/earnings/summary', () => {
  it('returns 200 with the inspector earnings summary', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockSummary.mockResolvedValueOnce({
      currency: 'AUD',
      totalApproved: 1500,
      nextPayment: 250,
      monthly: [
        { month: '2026-06', total: 500 },
        { month: '2026-07', total: 1000 },
      ],
    });
    const res = await supertest(app.server)
      .get('/v1/inspector/earnings/summary?months=2')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      currency: 'AUD',
      totalApproved: 1500,
      nextPayment: 250,
      monthly: [
        { month: '2026-06', total: 500 },
        { month: '2026-07', total: 1000 },
      ],
    });
    expect(mockSummary).toHaveBeenCalledWith({ inspectorId: 'insp-1', months: 2 });
  });

  it('defaults months to 6 when omitted', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockSummary.mockResolvedValueOnce({ currency: null, totalApproved: 0, nextPayment: 0, monthly: [] });
    const res = await supertest(app.server)
      .get('/v1/inspector/earnings/summary')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(mockSummary).toHaveBeenCalledWith({ inspectorId: 'insp-1', months: 6 });
  });

  it('returns 400 for an invalid months value', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const res = await supertest(app.server)
      .get('/v1/inspector/earnings/summary?months=99')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-INSP role', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    const res = await supertest(app.server)
      .get('/v1/inspector/earnings/summary')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('returns 400 when the inspector is not linked', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspNotLinked);
    const res = await supertest(app.server)
      .get('/v1/inspector/earnings/summary')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSPECTOR_NOT_LINKED');
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await supertest(app.server).get('/v1/inspector/earnings/summary');
    expect(res.status).toBe(401);
  });
});
