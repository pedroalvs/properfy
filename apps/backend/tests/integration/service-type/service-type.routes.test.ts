import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreateServiceTypeExecute = vi.fn();
const mockGetServiceTypeExecute = vi.fn();
const mockListServiceTypesExecute = vi.fn();
const mockUpdateServiceTypeExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: {
      createServiceTypeUseCase: { execute: mockCreateServiceTypeExecute },
      getServiceTypeUseCase: { execute: mockGetServiceTypeExecute },
      listServiceTypesUseCase: { execute: mockListServiceTypesExecute },
      updateServiceTypeUseCase: { execute: mockUpdateServiceTypeExecute },
      jwtService: { verify: mockJwtVerify },
    },
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

const SERVICE_TYPE_ID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const fullServiceType = {
  id: SERVICE_TYPE_ID,
  code: 'ROUTINE',
  name: 'Routine Inspection',
  flowType: 'ROUTINE',
  requiresTenantConfirmation: true,
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('POST /v1/service-types', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreateServiceTypeExecute.mockResolvedValueOnce(fullServiceType);

    const res = await supertest(app.server)
      .post('/v1/service-types')
      .set('Authorization', 'Bearer valid-token')
      .send({
        code: 'ROUTINE',
        name: 'Routine Inspection',
        flowType: 'ROUTINE',
        requiresTenantConfirmation: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.code).toBe('ROUTINE');
  });

  it('should return 422 with invalid payload (missing code)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/service-types')
      .set('Authorization', 'Bearer valid-token')
      .send({
        name: 'Routine Inspection',
        flowType: 'ROUTINE',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/service-types', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListServiceTypesExecute.mockResolvedValueOnce({
      data: [fullServiceType],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/service-types')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /v1/service-types/:serviceTypeId', () => {
  it('should return 200 with valid service type', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetServiceTypeExecute.mockResolvedValueOnce(fullServiceType);

    const res = await supertest(app.server)
      .get(`/v1/service-types/${SERVICE_TYPE_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(SERVICE_TYPE_ID);
  });
});

describe('PATCH /v1/service-types/:serviceTypeId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdateServiceTypeExecute.mockResolvedValueOnce({
      ...fullServiceType,
      name: 'Updated Routine Inspection',
    });

    const res = await supertest(app.server)
      .patch(`/v1/service-types/${SERVICE_TYPE_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Updated Routine Inspection' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Routine Inspection');
  });
});
