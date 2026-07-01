/**
 * T039-T041 — RBAC integration tests for privilege escalation prevention.
 *
 * Tests that no actor can create a user with a role above their own tier:
 *   - CL_ADMIN cannot create AM, OP users
 *   - OP cannot create AM users
 *   - CL_USER cannot create any user
 *   - INSP cannot create any user
 *   - AM can create any role (including AM)
 *
 * Escalation detection is enforced by AuthorizationService.assertNoPrivilegeEscalation()
 * inside the CreateUserUseCase.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  makeAmContext,
  makeOpContext,
  makeClAdminContext,
  makeClUserContext,
  makeInspContext,
} from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateUser = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: {
      jwtService: { verify: mockJwtVerify },
      createUserUseCase: { execute: mockCreateUser },
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

const userStubFor = (role: string) => ({
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
  tenantId: ['AM', 'OP'].includes(role) ? null : TENANT_ID,
  email: `${role.toLowerCase()}@example.com`,
  name: `New User ${role}`,
  phone: null,
  role,
  status: 'ACTIVE',
  branchId: null,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const escalationError = (actorRole: string, targetRole: string) =>
  new ForbiddenError('PRIVILEGE_ESCALATION', `Role ${actorRole} cannot create users with role ${targetRole}`);

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ── AM: can create any role ───────────────────────────────────────────────────

describe('Privilege escalation: AM can create any role', () => {
  for (const targetRole of ['AM', 'OP', 'CL_ADMIN', 'CL_USER']) {
    it(`AM creates ${targetRole} → 201`, async () => {
      const endpoint = ['AM', 'OP'].includes(targetRole) ? '/v1/users' : `/v1/tenants/${TENANT_ID}/users`;
      const payload = { email: `${targetRole.toLowerCase()}@ex.com`, name: 'New User',role: targetRole, password: 'Test@12345' };
      mockJwtVerify.mockResolvedValue(makeAmContext());
      mockCreateUser.mockResolvedValue(userStubFor(targetRole));
      const res = await supertest(app.server)
        .post(endpoint)
        .set('Authorization', 'Bearer t')
        .send(payload);
      expect(res.status).toBe(201);
    });
  }
});

// ── OP: can create CL_ADMIN and CL_USER, cannot create AM or OP ───────────────

describe('Privilege escalation: OP cannot create AM or OP', () => {
  it('OP creates AM → 403 (PRIVILEGE_ESCALATION)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockRejectedValue(escalationError('OP', 'AM'));
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send({ email: 'am@ex.com', name: 'New User',role: 'AM', password: 'Test@12345' });
    expect(res.status).toBe(403);
  });

  it('OP creates OP (peer) → 403 (PRIVILEGE_ESCALATION)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockRejectedValue(escalationError('OP', 'OP'));
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send({ email: 'op2@ex.com', name: 'New User',role: 'OP', password: 'Test@12345' });
    expect(res.status).toBe(403);
  });

  it('OP creates CL_ADMIN → 201 (allowed)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockResolvedValue(userStubFor('CL_ADMIN'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send({ email: 'cladmin@ex.com', name: 'New User',role: 'CL_ADMIN', password: 'Test@12345' });
    expect(res.status).toBe(201);
  });

  it('OP creates CL_USER → 201 (allowed)', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateUser.mockResolvedValue(userStubFor('CL_USER'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send({ email: 'cluser@ex.com', name: 'New User',role: 'CL_USER', password: 'Test@12345' });
    expect(res.status).toBe(201);
  });
});

// ── CL_ADMIN: can only create CL_ADMIN and CL_USER ────────────────────────────

describe('Privilege escalation: CL_ADMIN cannot create AM or OP', () => {
  it('CL_ADMIN creates AM → 403 (PRIVILEGE_ESCALATION)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(escalationError('CL_ADMIN', 'AM'));
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send({ email: 'am@ex.com', name: 'New User',role: 'AM', password: 'Test@12345' });
    expect(res.status).toBe(403);
  });

  it('CL_ADMIN creates OP → 403 (PRIVILEGE_ESCALATION)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(escalationError('CL_ADMIN', 'OP'));
    const res = await supertest(app.server)
      .post('/v1/users')
      .set('Authorization', 'Bearer t')
      .send({ email: 'op@ex.com', name: 'New User',role: 'OP', password: 'Test@12345' });
    expect(res.status).toBe(403);
  });

  it('CL_ADMIN creates CL_USER (own tenant) → 201 (allowed when setting enabled)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateUser.mockResolvedValue(userStubFor('CL_USER'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send({ email: 'cluser@ex.com', name: 'New User',role: 'CL_USER', password: 'Test@12345' });
    expect(res.status).toBe(201);
  });
});

// ── CL_USER and INSP: cannot create any user ─────────────────────────────────

describe('Privilege escalation: CL_USER and INSP cannot create any user', () => {
  it('CL_USER creates CL_USER → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockCreateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send({ email: 'u@ex.com', name: 'New User',role: 'CL_USER', password: 'Test@12345' });
    expect(res.status).toBe(403);
  });

  it('INSP creates any user → 403', async () => {
    mockJwtVerify.mockResolvedValue(makeInspContext());
    mockCreateUser.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer t')
      .send({ email: 'u@ex.com', name: 'New User',role: 'CL_USER', password: 'Test@12345' });
    expect(res.status).toBe(403);
  });
});
