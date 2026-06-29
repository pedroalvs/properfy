/**
 * T019 — RBAC integration tests for inspector management use cases.
 * Covers: create/update/deactivate/list/view-own per role.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext, makeInspContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateInspector = vi.fn();
const mockListInspectors = vi.fn();
const mockGetInspector = vi.fn();
const mockUpdateInspector = vi.fn();
const mockDeactivateInspector = vi.fn();
const mockCreateSlot = vi.fn();
const mockListSlots = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: {
      jwtService: { verify: mockJwtVerify },
      createInspectorUseCase: { execute: mockCreateInspector },
      listInspectorsUseCase: { execute: mockListInspectors },
      getInspectorUseCase: { execute: mockGetInspector },
      updateInspectorUseCase: { execute: mockUpdateInspector },
      deactivateInspectorUseCase: { execute: mockDeactivateInspector },
      createAvailabilitySlotUseCase: { execute: mockCreateSlot },
      listAvailabilitySlotsUseCase: { execute: mockListSlots },
    },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INSPECTOR_ID = 'e4ffee44-4d5e-4ef9-ee9e-9ee2ee603d55';

const inspectorStub = {
  id: INSPECTOR_ID,
  name: 'John Inspector',
  email: 'john@inspector.com',
  phone: '+61400000001',
  status: 'ACTIVE',
  paymentSettingsJson: null,
  serviceTypesJson: null,
  regionIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const listStub = { data: [inspectorStub], total: 1, page: 1, pageSize: 20 };

const createPayload = {
  name: 'New Inspector',
  email: 'new@inspector.com',
  phone: '+61400000002',
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

// ── POST /v1/inspectors ───────────────────────────────────────────────────────

describe('POST /v1/inspectors — RBAC (inspector.create)', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockCreateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(403);
  });

  it('denies INSP (cannot create peer inspector)', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockCreateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(403);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server)
      .post('/v1/inspectors')
      .send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ── GET /v1/inspectors ────────────────────────────────────────────────────────

describe('GET /v1/inspectors — RBAC (inspector.list)', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListInspectors.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListInspectors.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN (inspector.view_eligible)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListInspectors.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_USER (inspector.view_eligible)', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListInspectors.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows INSP (inspector.view_own)', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockListInspectors.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get('/v1/inspectors')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

// ── PATCH /v1/inspectors/:inspectorId ────────────────────────────────────────

describe('PATCH /v1/inspectors/:inspectorId — RBAC (inspector.update)', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockUpdateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ phone: '+61400000099' });
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockUpdateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ phone: '+61400000099' });
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpdateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ phone: '+61400000099' });
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockUpdateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ phone: '+61400000099' });
    expect(res.status).toBe(403);
  });

  it('denies INSP (cannot update own profile via this endpoint)', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext(INSPECTOR_ID));
    mockUpdateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .patch(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ phone: '+61400000099' });
    expect(res.status).toBe(403);
  });
});

// ── POST /v1/inspectors/:inspectorId/deactivate ───────────────────────────────

describe('POST /v1/inspectors/:inspectorId/deactivate — RBAC (inspector.deactivate)', () => {
  const payload = { reason: 'No longer available' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockDeactivateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockDeactivateInspector.mockResolvedValue(inspectorStub);
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockDeactivateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockDeactivateInspector.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/deactivate`)
      .send(payload);
    expect(res.status).toBe(401);
  });
});
