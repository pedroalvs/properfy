/**
 * T035, T038 — RBAC integration tests for CL_ADMIN conditional capabilities.
 *
 * Tests the `allowClientUserManagement` tenant setting gate on CL_ADMIN
 * user management operations:
 *   - Setting enabled → create/update/deactivate succeed (use case resolves)
 *   - Setting disabled → 403 (use case throws ForbiddenError with TENANT_SETTING_DISABLED)
 *
 * Also verifies that CL_ADMIN cannot access global (cross-tenant) operations
 * regardless of tenant settings.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeClAdminContext, makeAmContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateUser = vi.fn();
const mockListUsers = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeactivateUser = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: {
      jwtService: { verify: mockJwtVerify },
      createUserUseCase: { execute: mockCreateUser },
      listUsersUseCase: { execute: mockListUsers },
      updateUserUseCase: { execute: mockUpdateUser },
      deactivateUserUseCase: { execute: mockDeactivateUser },
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

// ── POST /v1/tenants/:tenantId/users — setting enabled vs disabled ─────────────

describe('CL_ADMIN: POST /v1/tenants/:tenantId/users — allowClientUserManagement gate', () => {
  it('setting enabled → 201 (use case resolves)', async () => {
    // The setting check is enforced by the use case (not the route layer).
    // We simulate use case success to represent "setting is enabled".
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });

  it('setting disabled → 403 (TENANT_SETTING_DISABLED)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(
      new ForbiddenError('TENANT_SETTING_DISABLED', "Tenant setting 'allowClientUserManagement' is not enabled"),
    );
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(403);
  });
});

// ── PATCH /v1/tenants/:tenantId/users/:userId — setting enabled vs disabled ───

describe('CL_ADMIN: PATCH /v1/tenants/:tenantId/users/:userId — allowClientUserManagement gate', () => {
  it('setting enabled → 200 (use case resolves)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpdateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
  });

  it('setting disabled → 403 (TENANT_SETTING_DISABLED)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpdateUser.mockRejectedValue(
      new ForbiddenError('TENANT_SETTING_DISABLED', "Tenant setting 'allowClientUserManagement' is not enabled"),
    );
    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer t')
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(403);
  });
});

// ── POST /v1/tenants/:tenantId/users/:userId/deactivate — CL_ADMIN always 403 ─

describe('CL_ADMIN: POST /v1/tenants/:tenantId/users/:userId/deactivate — always denied (user.deactivate is AM/OP only)', () => {
  it('CL_ADMIN → 403 regardless of tenant settings', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockDeactivateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .send({ reason: 'test' });
    expect(res.status).toBe(403);
  });
});

// ── Cross-tenant scope: CL_ADMIN cannot act on other tenant's users ───────────

describe('CL_ADMIN: cross-tenant user access denied', () => {
  const OTHER_TENANT_ID = 'f5eeee55-5e6f-5ef9-ff0e-0ff3fe714e66';

  it('CL_ADMIN acting on other tenant → 403 (TENANT_SCOPE_VIOLATION)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListUsers.mockRejectedValue(
      new ForbiddenError('TENANT_SCOPE_VIOLATION', 'Cross-tenant access is forbidden'),
    );
    const res = await supertest(app.server)
      .get(`/v1/tenants/${OTHER_TENANT_ID}/users`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── AM bypasses tenant setting (creates users unconditionally) ────────────────

describe('AM: user creation is unconditional (no tenant setting check)', () => {
  it('AM → 201 without any tenant settings restriction', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateUser.mockResolvedValue(userStub);
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send(createPayload);
    expect(res.status).toBe(201);
  });
});
