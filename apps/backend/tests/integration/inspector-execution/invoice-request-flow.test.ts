import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockAvailablePeriods = vi.fn();
const mockPreview = vi.fn();
const mockRequest = vi.fn();
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
      getAvailablePeriodsUseCase: { execute: mockAvailablePeriods },
      previewInvoiceUseCase: { execute: mockPreview },
      requestInvoiceUseCase: { execute: mockRequest },
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

describe('GET /v1/inspector/invoices/available-periods', () => {
  it('returns 200 with the closed periods for the inspector', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockAvailablePeriods.mockResolvedValueOnce({
      billingCycle: 'FORTNIGHTLY',
      periods: [{ periodType: 'FORTNIGHTLY', periodStart: '2026-06-29', periodEnd: '2026-07-12' }],
    });
    const res = await supertest(app.server)
      .get('/v1/inspector/invoices/available-periods?count=1')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.billingCycle).toBe('FORTNIGHTLY');
    expect(res.body.periods).toHaveLength(1);
    expect(mockAvailablePeriods).toHaveBeenCalledWith({ inspectorId: 'insp-1', count: 1 });
  });

  it('returns 403 for a non-INSP role', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    const res = await supertest(app.server)
      .get('/v1/inspector/invoices/available-periods')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(mockAvailablePeriods).not.toHaveBeenCalled();
  });

  it('returns 400 when the inspector is not linked', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspNotLinked);
    const res = await supertest(app.server)
      .get('/v1/inspector/invoices/available-periods')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSPECTOR_NOT_LINKED');
  });
});

describe('GET /v1/inspector/invoices/preview', () => {
  it('returns 200 with the preview totals', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockPreview.mockResolvedValueOnce({
      periodType: 'FORTNIGHTLY',
      periodStart: '2026-06-29',
      periodEnd: '2026-07-12',
      payoutCount: 3,
      totalAmount: 1050,
      currency: 'AUD',
    });
    const res = await supertest(app.server)
      .get('/v1/inspector/invoices/preview?periodStart=2026-06-29&periodEnd=2026-07-12')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.payoutCount).toBe(3);
    expect(res.body.totalAmount).toBe(1050);
  });

  it('returns 403 for a non-INSP role', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    const res = await supertest(app.server)
      .get('/v1/inspector/invoices/preview?periodStart=2026-06-29&periodEnd=2026-07-12')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/inspector/invoices/request', () => {
  it('returns 201 with the created PENDING_REVIEW invoice', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockRequest.mockResolvedValueOnce({
      invoiceId: '11111111-1111-1111-1111-111111111111',
      inspectorId: '22222222-2222-2222-2222-222222222222',
      periodType: 'FORTNIGHTLY',
      periodStart: '2026-06-29',
      periodEnd: '2026-07-12',
      status: 'PENDING_REVIEW',
      totalAmount: 1050,
      currency: 'AUD',
      payoutCount: 3,
    });
    const res = await supertest(app.server)
      .post('/v1/inspector/invoices/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ periodStart: '2026-06-29', periodEnd: '2026-07-12' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_REVIEW');
    expect(res.body.invoiceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(mockRequest).toHaveBeenCalledWith({ inspectorId: 'insp-1', periodStart: '2026-06-29', periodEnd: '2026-07-12' });
  });

  it('returns 403 for a non-INSP role', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    const res = await supertest(app.server)
      .post('/v1/inspector/invoices/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ periodStart: '2026-06-29', periodEnd: '2026-07-12' });
    expect(res.status).toBe(403);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid period (end before start)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const res = await supertest(app.server)
      .post('/v1/inspector/invoices/request')
      .set('Authorization', 'Bearer valid-token')
      .send({ periodStart: '2026-07-12', periodEnd: '2026-06-29' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
