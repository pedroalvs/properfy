/**
 * T016 — RBAC integration tests for user management use cases.
 * Covers: create/list/update/deactivate/reset-password per role.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext, makeInspContext, forbidden } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateUser = vi.fn();
const mockListUsers = vi.fn();
const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeactivateUser = vi.fn();
const mockResetUserPassword = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: {
      jwtService: { verify: mockJwtVerify },
      createUserUseCase: { execute: mockCreateUser },
      listUsersUseCase: { execute: mockListUsers },
      getUserUseCase: { execute: mockGetUser },
      updateUserUseCase: { execute: mockUpdateUser },
      deactivateUserUseCase: { execute: mockDeactivateUser },
      resetUserPasswordUseCase: { execute: mockResetUserPassword },
    },
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
const USER_ID = 'd3eeff33-3c4d-4ef9-dd8f-8dd1df592c44';

const userStub = {
  id: USER_ID,
  tenantId: TENANT_ID,
  email: 'user@example.com',
  name: 'Test User',
  phone: null,
  role: 'CL_USER',
  status: 'ACTIVE',
  branchId: null,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const listStub = { data: [userStub], total: 1, page: 1, pageSize: 20 };

const createPayload = {
  email: 'newuser@example.com',
  name: 'New User',
  role: 'CL_USER',
  password: 'Test@12345',
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

// ── POST /v1/tenants/:tenantId/users ──────────────────────────────────────────

describe('POST /v1/tenants/:tenantId/users — RBAC (user.create_tenant)', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows CL_ADMIN (when tenant setting allows)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(403);
  });

  it('denies INSP', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockCreateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(403);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ── POST /v1/users (internal) ─────────────────────────────────────────────────

describe('POST /v1/users — RBAC (user.create_internal)', () => {
  const internalPayload = { email: 'opuser@example.com', name: 'Op User', role: 'OP', password: 'Test@12345' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateUser.mockResolvedValue({ ...userStub, role: 'OP', tenantId: null, branchId: null });
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send(internalPayload);
    expect(res.status).toBe(201);
  });

  it('denies OP (cannot create peer internal user)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockRejectedValue(new ForbiddenError('PRIVILEGE_ESCALATION', 'Role OP cannot create users with role OP'));
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send(internalPayload);
    expect(res.status).toBe(403);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send(internalPayload);
    expect(res.status).toBe(403);
  });
});

// ── GET /v1/tenants/:tenantId/users ──────────────────────────────────────────

describe('GET /v1/tenants/:tenantId/users — RBAC (user.list)', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListUsers.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListUsers.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN (own tenant)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListUsers.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListUsers.mockResolvedValue(listStub);
    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`);
    expect(res.status).toBe(401);
  });
});

// ── PATCH /v1/tenants/:tenantId/users/:userId ─────────────────────────────────

describe('PATCH /v1/tenants/:tenantId/users/:userId — RBAC (user.update)', () => {
  const updatePayload = { name: 'Updated Name' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockUpdateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer t')
      .send(updatePayload);
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockUpdateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer t')
      .send(updatePayload);
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpdateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer t')
      .send(updatePayload);
    expect(res.status).toBe(200);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockUpdateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer t')
      .send(updatePayload);
    expect(res.status).toBe(403);
  });
});

// ── POST /v1/tenants/:tenantId/users/:userId/deactivate ───────────────────────

describe('POST /v1/tenants/:tenantId/users/:userId/deactivate — RBAC (user.deactivate)', () => {
  const payload = { reason: 'No longer required' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockDeactivateUser.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(204);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockDeactivateUser.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(204);
  });

  it('denies CL_ADMIN (deactivate is AM/OP only per matrix)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockDeactivateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockDeactivateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });

  it('denies unauthenticated', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .send(payload);
    expect(res.status).toBe(401);
  });
});

// ── POST /v1/tenants/:tenantId/users/:userId/reset-password ──────────────────

describe('POST /v1/tenants/:tenantId/users/:userId/reset-password — RBAC (user.reset_password)', () => {
  const payload = { newPassword: 'NewPass@12345' };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockResetUserPassword.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/reset-password`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(204);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockResetUserPassword.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/reset-password`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(204);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockResetUserPassword.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/reset-password`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockResetUserPassword.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/reset-password`)
      .set('Authorization', 'Bearer t')
      .send(payload);
    expect(res.status).toBe(403);
  });
});
