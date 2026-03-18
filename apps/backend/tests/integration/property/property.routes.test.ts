import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreatePropertyExecute = vi.fn();
const mockGetPropertyExecute = vi.fn();
const mockListPropertiesExecute = vi.fn();
const mockUpdatePropertyExecute = vi.fn();
const mockDeletePropertyExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: {
      createPropertyUseCase: { execute: mockCreatePropertyExecute },
      getPropertyUseCase: { execute: mockGetPropertyExecute },
      listPropertiesUseCase: { execute: mockListPropertiesExecute },
      updatePropertyUseCase: { execute: mockUpdatePropertyExecute },
      deletePropertyUseCase: { execute: mockDeletePropertyExecute },
      geocodePropertyUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify },
    },
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
const PROPERTY_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

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

const fullProperty = {
  id: PROPERTY_ID,
  tenantId: TENANT_ID,
  branchId: null,
  propertyCode: 'PROP-001',
  type: 'RESIDENTIAL',
  street: '123 Main St',
  addressLine2: null,
  suburb: 'Sydney',
  postcode: '2000',
  state: 'NSW',
  country: 'AU',
  lat: null,
  lng: null,
  geocodingStatus: 'PENDING',
  notes: null,
  rulesJson: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('POST /v1/properties', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreatePropertyExecute.mockResolvedValueOnce(fullProperty);

    const res = await supertest(app.server)
      .post('/v1/properties')
      .set('Authorization', 'Bearer valid-token')
      .send({
        tenantId: TENANT_ID,
        propertyCode: 'PROP-001',
        type: 'RESIDENTIAL',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.propertyCode).toBe('PROP-001');
  });

  it('should return 400 with invalid payload (missing propertyCode)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/properties')
      .set('Authorization', 'Bearer valid-token')
      .send({
        type: 'RESIDENTIAL',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post('/v1/properties')
      .send({
        propertyCode: 'PROP-001',
        type: 'RESIDENTIAL',
        street: '123 Main St',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/properties', () => {
  it('should return 200 with paginated response', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListPropertiesExecute.mockResolvedValueOnce({
      data: [fullProperty],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/properties')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /v1/properties/:propertyId', () => {
  it('should return 200 with valid property', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetPropertyExecute.mockResolvedValueOnce(fullProperty);

    const res = await supertest(app.server)
      .get(`/v1/properties/${PROPERTY_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PROPERTY_ID);
  });

  it('should return 404 when property not found', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const { NotFoundError } = await import('../../../src/shared/domain/errors');
    mockGetPropertyExecute.mockRejectedValueOnce(
      new NotFoundError('PROPERTY_NOT_FOUND', 'Property not found'),
    );

    const res = await supertest(app.server)
      .get(`/v1/properties/${PROPERTY_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('should return 400 with invalid property ID format', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .get('/v1/properties/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
  });
});

describe('PATCH /v1/properties/:propertyId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdatePropertyExecute.mockResolvedValueOnce({
      ...fullProperty,
      propertyCode: 'PROP-002',
    });

    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ propertyCode: 'PROP-002' });

    expect(res.status).toBe(200);
    expect(res.body.data.propertyCode).toBe('PROP-002');
  });
});

describe('DELETE /v1/properties/:propertyId', () => {
  it('should return 204 on success', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeletePropertyExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete(`/v1/properties/${PROPERTY_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
  });
});
