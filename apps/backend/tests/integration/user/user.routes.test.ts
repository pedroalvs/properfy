import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

// Module-level mock functions for user use cases
const mockCreateUserExecute = vi.fn();
const mockGetUserExecute = vi.fn();
const mockListUsersExecute = vi.fn();
const mockUpdateUserExecute = vi.fn();
const mockDeactivateUserExecute = vi.fn();
const mockResetUserPasswordExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: {
      createUserUseCase: { execute: mockCreateUserExecute },
      getUserUseCase: { execute: mockGetUserExecute },
      listUsersUseCase: { execute: mockListUsersExecute },
      updateUserUseCase: { execute: mockUpdateUserExecute },
      deactivateUserUseCase: { execute: mockDeactivateUserExecute },
      resetUserPasswordUseCase: { execute: mockResetUserPasswordExecute },
      jwtService: { verify: mockJwtVerify },
    },
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
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER_ID = 'c2aade11-1b2d-4ef0-ad8f-8dd1df502c33';

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

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
});

describe('POST /v1/tenants/:tenantId/users/:userId/reset-password', () => {
  it('should return 204 on successful password reset', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockResetUserPasswordExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/reset-password`)
      .set('Authorization', 'Bearer valid-token')
      .send({ newPassword: 'NewStrong1!' });

    expect(res.status).toBe(204);
    expect(mockResetUserPasswordExecute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      newPassword: 'NewStrong1!',
      actor: amContext,
    });
  });

  it('should return 400 with invalid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/reset-password`)
      .set('Authorization', 'Bearer valid-token')
      .send({ newPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /v1/tenants/:tenantId/users', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateUserExecute.mockResolvedValueOnce({
      id: USER_ID,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'CL_ADMIN',
      tenantId: TENANT_ID,
      branchId: null,
      inspectorId: null,
      phone: null,
      status: 'ACTIVE',
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'StrongPass1!',
        role: 'CL_ADMIN',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('John Doe');
  });

  it('should return 400 with invalid payload (missing email)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'John Doe',
        password: 'StrongPass1!',
        role: 'CL_ADMIN',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 with weak password', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'weak',
        role: 'CL_ADMIN',
      });

    expect(res.status).toBe(400);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users`)
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'StrongPass1!',
        role: 'CL_ADMIN',
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/tenants/:tenantId/users', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListUsersExecute.mockResolvedValueOnce({
      data: [
        {
          id: USER_ID,
          name: 'John Doe',
          email: 'john@example.com',
          role: 'CL_ADMIN',
          tenantId: TENANT_ID,
          branchId: null,
          inspectorId: null,
          phone: null,
          status: 'ACTIVE',
          totpEnabled: false,
          lastLoginAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users`);

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/tenants/:tenantId/users/:userId', () => {
  it('should return 200 with valid user', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetUserExecute.mockResolvedValueOnce({
      id: USER_ID,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'CL_ADMIN',
      tenantId: TENANT_ID,
      branchId: null,
      inspectorId: null,
      phone: null,
      status: 'ACTIVE',
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(USER_ID);
  });

  it('should return 404 when user not found', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const { NotFoundError } = await import('../../../src/shared/domain/errors');
    mockGetUserExecute.mockRejectedValueOnce(
      new NotFoundError('USER_NOT_FOUND', 'User not found'),
    );

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('should return 400 with invalid user ID format', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/users/not-a-uuid`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
  });
});

describe('PATCH /v1/tenants/:tenantId/users/:userId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateUserExecute.mockResolvedValueOnce({
      id: USER_ID,
      name: 'Jane Doe',
      email: 'john@example.com',
      role: 'CL_ADMIN',
      tenantId: TENANT_ID,
      branchId: null,
      inspectorId: null,
      phone: '+61412345678',
      status: 'ACTIVE',
      totpEnabled: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Jane Doe', phone: '+61412345678' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Jane Doe');
  });

  it('should return 400 with invalid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/users/${USER_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: '' }); // min 1 char

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/tenants/:tenantId/users/:userId/deactivate', () => {
  it('should return 204 on success', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeactivateUserExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Employee left the company' });

    expect(res.status).toBe(204);
  });

  it('should return 400 when reason is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/users/${USER_ID}/deactivate`)
      .send({ reason: 'Employee left' });

    expect(res.status).toBe(401);
  });
});
