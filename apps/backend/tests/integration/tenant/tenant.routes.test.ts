import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

// Module-level mock functions for tenant use cases
const mockCreateTenantExecute = vi.fn();
const mockGetTenantExecute = vi.fn();
const mockListTenantsExecute = vi.fn();
const mockUpdateTenantExecute = vi.fn();
const mockDeactivateTenantExecute = vi.fn();
const mockCreateBranchExecute = vi.fn();
const mockListBranchesExecute = vi.fn();
const mockUpdateBranchExecute = vi.fn();
const mockDeactivateBranchExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      createTenantUseCase: { execute: mockCreateTenantExecute },
      getTenantUseCase: { execute: mockGetTenantExecute },
      listTenantsUseCase: { execute: mockListTenantsExecute },
      updateTenantUseCase: { execute: mockUpdateTenantExecute },
      deactivateTenantUseCase: { execute: mockDeactivateTenantExecute },
      createBranchUseCase: { execute: mockCreateBranchExecute },
      listBranchesUseCase: { execute: mockListBranchesExecute },
      updateBranchUseCase: { execute: mockUpdateBranchExecute },
      deactivateBranchUseCase: { execute: mockDeactivateBranchExecute },
      jwtService: { verify: mockJwtVerify },
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
const BRANCH_ID = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';

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

// ---- Tenant CRUD ----

describe('POST /v1/tenants', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateTenantExecute.mockResolvedValueOnce({
      id: TENANT_ID,
      name: 'Acme Realty',
      legalName: 'Acme Realty Pty Ltd',
      status: 'PENDING',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      appointmentCodePrefix: 'ACME',
      settingsJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .post('/v1/tenants')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'Acme Realty',
        legalName: 'Acme Realty Pty Ltd',
        appointmentCodePrefix: 'ACME',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Acme Realty');
  });

  it('should return 400 with invalid payload (missing name)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/tenants')
      .set('Authorization', 'Bearer valid-token')
      .send({ legalName: 'Acme Realty Pty Ltd' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 403 for non-AM role', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const { ForbiddenError } = await import('../../../src/shared/domain/errors');
    mockCreateTenantExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .post('/v1/tenants')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'Acme Realty',
        legalName: 'Acme Realty Pty Ltd',
        appointmentCodePrefix: 'ACME',
      });

    expect(res.status).toBe(403);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post('/v1/tenants')
      .send({
        name: 'Acme Realty',
        legalName: 'Acme Realty Pty Ltd',
        appointmentCodePrefix: 'ACME',
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/tenants', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListTenantsExecute.mockResolvedValueOnce({
      data: [
        {
          id: TENANT_ID,
          name: 'Acme Realty',
          legalName: 'Acme Realty Pty Ltd',
          status: 'ACTIVE',
          timezone: 'Australia/Sydney',
          currency: 'AUD',
          appointmentCodePrefix: null,
          settingsJson: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/tenants')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server).get('/v1/tenants');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/tenants/:tenantId', () => {
  it('should return 200 with valid tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetTenantExecute.mockResolvedValueOnce({
      id: TENANT_ID,
      name: 'Acme Realty',
      legalName: 'Acme Realty Pty Ltd',
      status: 'ACTIVE',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      appointmentCodePrefix: null,
      settingsJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(TENANT_ID);
  });

  it('should return 404 when tenant not found', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const { NotFoundError } = await import('../../../src/shared/domain/errors');
    mockGetTenantExecute.mockRejectedValueOnce(
      new NotFoundError('TENANT_NOT_FOUND', 'Tenant not found'),
    );

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('should return 400 with invalid tenant ID format', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .get('/v1/tenants/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
  });
});

describe('PATCH /v1/tenants/:tenantId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateTenantExecute.mockResolvedValueOnce({
      id: TENANT_ID,
      name: 'Updated Realty',
      legalName: 'Acme Realty Pty Ltd',
      status: 'ACTIVE',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      appointmentCodePrefix: null,
      settingsJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Updated Realty' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Realty');
  });

  it('should return 400 with invalid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: '' }); // min 1 char

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/tenants/:tenantId/deactivate', () => {
  it('should return 200 with updated entity on success', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeactivateTenantExecute.mockResolvedValueOnce({
      id: TENANT_ID,
      name: 'Test Tenant',
      status: 'INACTIVE',
      deactivatedAt: new Date(),
    });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'No longer active' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  it('should return 400 when reason is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---- Branch CRUD ----

describe('POST /v1/tenants/:tenantId/branches', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateBranchExecute.mockResolvedValueOnce({
      id: BRANCH_ID,
      tenantId: TENANT_ID,
      name: 'Main Branch',
      addressJson: null,
      contactEmail: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branches`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Main Branch' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Main Branch');
  });

  it('should return 400 with invalid payload (missing name)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branches`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/tenants/:tenantId/branches', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListBranchesExecute.mockResolvedValueOnce({
      data: [
        {
          id: BRANCH_ID,
          tenantId: TENANT_ID,
          name: 'Main Branch',
          addressJson: null,
          contactEmail: null,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get(`/v1/tenants/${TENANT_ID}/branches`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });
});

describe('PATCH /v1/tenants/:tenantId/branches/:branchId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateBranchExecute.mockResolvedValueOnce({
      id: BRANCH_ID,
      tenantId: TENANT_ID,
      name: 'Updated Branch',
      addressJson: null,
      contactEmail: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/branches/${BRANCH_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Updated Branch' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Branch');
  });

  it('should return 400 with invalid branch ID format', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .patch(`/v1/tenants/${TENANT_ID}/branches/not-a-uuid`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Updated Branch' });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/tenants/:tenantId/branches/:branchId/deactivate', () => {
  it('should return 200 with updated entity on success', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeactivateBranchExecute.mockResolvedValueOnce({
      id: BRANCH_ID,
      tenantId: TENANT_ID,
      name: 'Test Branch',
      status: 'INACTIVE',
      deactivatedAt: new Date(),
    });

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branches/${BRANCH_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Branch closed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  it('should return 400 when reason is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branches/${BRANCH_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/tenants/${TENANT_ID}/branches/${BRANCH_ID}/deactivate`)
      .send({ reason: 'Branch closed' });

    expect(res.status).toBe(401);
  });
});
