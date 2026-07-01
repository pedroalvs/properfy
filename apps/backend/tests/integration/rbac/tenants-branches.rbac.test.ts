import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext, throwForbidden } from './helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateTenant = vi.fn();
const mockListTenants = vi.fn();
const mockGetTenant = vi.fn();
const mockDeactivateTenant = vi.fn();
const mockActivateTenant = vi.fn();
const mockCreateBranch = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      jwtService: { verify: mockJwtVerify },
      createTenantUseCase: { execute: mockCreateTenant },
      listTenantsUseCase: { execute: mockListTenants },
      getTenantUseCase: { execute: mockGetTenant },
      deactivateTenantUseCase: { execute: mockDeactivateTenant },
      activateTenantUseCase: { execute: mockActivateTenant },
      createBranchUseCase: { execute: mockCreateBranch },
    },
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
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const BRANCH_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const branchStub = {
  id: BRANCH_ID,
  tenantId: TENANT_ID,
  name: 'Main Branch',
  addressJson: null,
  contactEmail: null,
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const tenantStub = {
  id: TENANT_ID,
  name: 'Test Tenant',
  status: 'ACTIVE',
  legalName: 'Test Tenant Pty Ltd',
  timezone: 'Australia/Sydney',
  currency: 'AUD',
  appointmentCodePrefix: null,
  settingsJson: {},
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

// ── POST /v1/tenants ──────────────────────────────────────────────────────────

describe('POST /v1/tenants — RBAC', () => {
  const payload = { name: 'Acme Realty', legalName: 'Acme Realty Pty Ltd', appointmentCodePrefix: 'ACME' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateTenant.mockResolvedValue(tenantStub);
    const res = await supertest(app.server)
      .post('/v1/tenants').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(201);
  });

  it('denies OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/tenants').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/tenants').set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server).post('/v1/tenants').send(payload);
    expect(res.status).toBe(401);
  });
});

// ── GET /v1/tenants ───────────────────────────────────────────────────────────

describe('GET /v1/tenants — RBAC', () => {
  const listStub = { data: [tenantStub], total: 1, page: 1, pageSize: 20 };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListTenants.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/tenants').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListTenants.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/tenants').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListTenants.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/tenants').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListTenants.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/tenants').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── GET /v1/tenants/:tenantId ─────────────────────────────────────────────────

describe('GET /v1/tenants/:tenantId — RBAC', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockGetTenant.mockResolvedValue(tenantStub);
    const res = await supertest(app.server).get(`/v1/tenants/${TENANT_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockGetTenant.mockResolvedValue(tenantStub);
    const res = await supertest(app.server).get(`/v1/tenants/${TENANT_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN for own tenant', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockGetTenant.mockResolvedValue(tenantStub);
    const res = await supertest(app.server).get(`/v1/tenants/${TENANT_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN for other tenant (cross-tenant scope)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext('other-tenant-0000-0000-000000000000'));
    mockGetTenant.mockRejectedValue(new ForbiddenError('TENANT_SCOPE_VIOLATION', 'Cross-tenant access is forbidden'));
    const res = await supertest(app.server).get(`/v1/tenants/${TENANT_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockGetTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get(`/v1/tenants/${TENANT_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── POST /v1/tenants/:tenantId/deactivate ─────────────────────────────────────

describe('POST /v1/tenants/:tenantId/deactivate — RBAC', () => {
  const payload = { reason: 'No longer active' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockDeactivateTenant.mockResolvedValue({ ...tenantStub, status: 'INACTIVE' });
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/deactivate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockDeactivateTenant.mockResolvedValue({ ...tenantStub, status: 'INACTIVE' });
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/deactivate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockDeactivateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/deactivate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockDeactivateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/deactivate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });
});

// ── POST /v1/tenants/:tenantId/activate ──────────────────────────────────────

describe('POST /v1/tenants/:tenantId/activate — RBAC', () => {
  const payload = { reason: 'Reactivating account' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockActivateTenant.mockResolvedValue({ ...tenantStub, status: 'ACTIVE' });
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/activate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockActivateTenant.mockResolvedValue({ ...tenantStub, status: 'ACTIVE' });
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/activate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockActivateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/activate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockActivateTenant.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/activate`).set('Authorization', 'Bearer t').send(payload);
    expect(res.status).toBe(403);
  });
});

// ── QA-002-HIGH-001 regression: POST /v1/tenants/:tenantId/branches returns updatedAt ──

describe('QA-002-HIGH-001 — POST /v1/tenants/:tenantId/branches response shape', () => {
  it('returns 201 with updatedAt in response (Pattern A regression guard)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockCreateBranch.mockResolvedValueOnce(branchStub);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branches`)
      .set('Authorization', 'Bearer t')
      .send({ name: 'Main Branch' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(BRANCH_ID);
    expect(res.body.data.updatedAt).toBeDefined();
  });
});
