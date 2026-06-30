import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockDraftInspectorInvoiceExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
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
      draftInspectorInvoiceUseCase: { execute: mockDraftInspectorInvoiceExecute },
      jwtService: { verify: mockJwtVerify },
    },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const inspContext = { userId: 'insp-1', tenantId: 'tenant-1', role: 'INSP', branchId: null, inspectorId: 'insp-1' };
const opContext = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /v1/inspector/invoices/draft', () => {
  it('should return 201 with invoice summary on happy path', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const draftResult = {
      inspectorId: 'insp-1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      totalPayout: 42500,
      entryCount: 5,
    };
    mockDraftInspectorInvoiceExecute.mockResolvedValueOnce(draftResult);

    const res = await supertest(app.server)
      .post('/v1/inspector/invoices/draft')
      .set('Authorization', 'Bearer valid-token')
      .send({ periodStart: '2026-03-01', periodEnd: '2026-03-31' });

    expect(res.status).toBe(201);
    expect(res.body.data.totalPayout).toBe(42500);
    expect(res.body.data.entryCount).toBe(5);
  });

  it('should return 403 when non-INSP role tries to draft invoice', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .post('/v1/inspector/invoices/draft')
      .set('Authorization', 'Bearer valid-token')
      .send({ periodStart: '2026-03-01', periodEnd: '2026-03-31' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should return 400 with invalid period (periodEnd before periodStart)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post('/v1/inspector/invoices/draft')
      .set('Authorization', 'Bearer valid-token')
      .send({ periodStart: '2026-04-01', periodEnd: '2026-03-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
