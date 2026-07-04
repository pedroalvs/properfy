import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext } from './helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockCreateProperty = vi.fn();
const mockListProperties = vi.fn();
const mockUpdateProperty = vi.fn();
const mockDeleteProperty = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: {
      jwtService: { verify: mockJwtVerify },
      createPropertyUseCase: { execute: mockCreateProperty },
      listPropertiesUseCase: { execute: mockListProperties },
      updatePropertyUseCase: { execute: mockUpdateProperty },
      deletePropertyUseCase: { execute: mockDeleteProperty },
    },
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
const PROPERTY_ID = 'b1ccef11-1a2b-4ef8-bb6d-6bb9bd380a22';

const propertyStub = {
  id: PROPERTY_ID,
  tenantId: TENANT_ID,
  branchId: null,
  propertyCode: 'PROP-001',
  type: 'HOUSE',
  street: '1 Main St',
  addressLine2: null,
  suburb: 'Sydney',
  postcode: '2000',
  state: 'NSW',
  country: 'AU',
  geocodingStatus: 'PENDING',
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createPayload = {
  propertyCode: 'PROP-001',
  type: 'HOUSE',
  street: '1 Main St',
  suburb: 'Sydney',
  postcode: '2000',
  state: 'NSW',
  country: 'AU',
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

// ── POST /v1/properties ───────────────────────────────────────────────────────

describe('POST /v1/properties — RBAC', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockCreateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .post('/v1/properties').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockCreateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .post('/v1/properties').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(201);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockCreateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .post('/v1/properties').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(201);
  });

  it('denies CL_USER without create_properties flag', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockCreateProperty.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .post('/v1/properties').set('Authorization', 'Bearer t').send(createPayload);
    expect(res.status).toBe(403);
  });
});

// ── GET /v1/properties ────────────────────────────────────────────────────────

describe('GET /v1/properties — RBAC', () => {
  const listStub = { data: [propertyStub], total: 1, page: 1, pageSize: 20 };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListProperties.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/properties').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListProperties.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/properties').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListProperties.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/properties').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListProperties.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/properties').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

// ── PUT /v1/properties/:id ────────────────────────────────────────────────────

describe('PATCH /v1/properties/:propertyId — RBAC', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockUpdateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t').send({ notes: 'updated' });
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockUpdateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t').send({ notes: 'updated' });
    expect(res.status).toBe(200);
  });

  it('allows CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpdateProperty.mockResolvedValue(propertyStub);
    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t').send({ notes: 'updated' });
    expect(res.status).toBe(200);
  });

  it('denies CL_USER without create_properties flag', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID, []));
    mockUpdateProperty.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .patch(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t').send({ notes: 'updated' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /v1/properties/:id ─────────────────────────────────────────────────

describe('DELETE /v1/properties/:propertyId — RBAC', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockDeleteProperty.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .delete(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(204);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockDeleteProperty.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .delete(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(204);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockDeleteProperty.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .delete(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockDeleteProperty.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .delete(`/v1/properties/${PROPERTY_ID}`).set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});
