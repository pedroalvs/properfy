import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext } from './helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockListEntries = vi.fn();
const mockCreateManualAdjustment = vi.fn();

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
    billing: {
      jwtService: { verify: mockJwtVerify },
      listFinancialEntriesUseCase: { execute: mockListEntries },
      createManualAdjustmentUseCase: { execute: mockCreateManualAdjustment },
    },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const entryStub = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  tenantId: TENANT_ID,
  appointmentId: null,
  inspectorId: null,
  entryType: 'MANUAL_ADJUSTMENT',
  amount: 100,
  currency: 'AUD',
  status: 'PENDING',
  description: 'Test',
  effectiveAt: new Date().toISOString(),
  initiatedByUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
  approvedByUserId: null,
  approvedAt: null,
  referenceEntryId: null,
  reason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ── GET /v1/financial/entries ─────────────────────────────────────────────────

describe('GET /v1/financial/entries — RBAC', () => {
  const listStub = { data: [entryStub], total: 1, page: 1, pageSize: 20 };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListEntries.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListEntries.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListEntries.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListEntries.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/financial/entries').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server).get('/v1/financial/entries');
    expect(res.status).toBe(401);
  });
});

// ── POST /v1/financial/entries/adjust ────────────────────────────────────────

describe('POST /v1/financial/entries/adjust — RBAC', () => {
  const adjustPayload = {
    tenantId: TENANT_ID,
    amount: 50,
    description: 'Test adjustment',
    reason: 'RBAC test adjustment',
  };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateManualAdjustment.mockResolvedValue(entryStub);
    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust').set('Authorization', 'Bearer t').send(adjustPayload);
    expect(res.status).toBe(201);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateManualAdjustment.mockResolvedValue(entryStub);
    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust').set('Authorization', 'Bearer t').send(adjustPayload);
    expect(res.status).toBe(201);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateManualAdjustment.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust').set('Authorization', 'Bearer t').send(adjustPayload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockCreateManualAdjustment.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/financial/entries/adjust').set('Authorization', 'Bearer t').send(adjustPayload);
    expect(res.status).toBe(403);
  });
});
