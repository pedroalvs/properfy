/**
 * Integration tests for service-region routes.
 *
 * These tests use the mock-container pattern (no real DB) — the use cases
 * are mocked and the tests verify HTTP-level contract: auth, routing,
 * request validation, response shape, and error propagation.
 *
 * Real-DB spatial and audit tests live in the adjacent files:
 *   - spatial-matching.test.ts  (under tests/integration/db/)
 *   - audit.test.ts             (under tests/integration/db/)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  ServiceRegionNameConflictError,
  ServiceRegionNotFoundError,
  ServiceRegionStillActiveError,
  ServiceRegionHasPublishedGroupsError,
} from '../../../src/modules/service-region/domain/service-region.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

// ---- Mock fns ----

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGet = vi.fn();
const mockList = vi.fn();
const mockDeactivate = vi.fn();
const mockDelete = vi.fn();
const mockResolve = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      auth: { jwtService: { verify: mockJwtVerify } },
      tenant: { jwtService: { verify: mockJwtVerify } },
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
      dashboard: { jwtService: { verify: mockJwtVerify } },
      serviceRegion: {
        createServiceRegionUseCase: { execute: mockCreate },
        updateServiceRegionUseCase: { execute: mockUpdate },
        getServiceRegionUseCase: { execute: mockGet },
        listServiceRegionsUseCase: { execute: mockList },
        deactivateServiceRegionUseCase: { execute: mockDeactivate },
        deleteServiceRegionUseCase: { execute: mockDelete },
        resolveRegionsUseCase: { execute: mockResolve },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

// ---- Shared fixtures ----

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const REGION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-2', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };
const inspContext = { userId: 'insp-1', tenantId: TENANT_A, role: 'INSP', branchId: null, inspectorId: 'inspector-1' };

const validPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [150.5, -34.0],
      [151.5, -34.0],
      [151.5, -33.0],
      [150.5, -33.0],
      [150.5, -34.0],
    ],
  ],
};

const fullRegion = {
  id: REGION_ID,
  name: 'Sydney CBD',
  geojson: validPolygon,
  color: '#3b82f6',
  status: 'ACTIVE',
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

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /v1/service-regions — Create
// ---------------------------------------------------------------------------

describe('POST /v1/service-regions', () => {
  // T126: Create success (AM)
  it('AM — creates region successfully', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreate.mockResolvedValueOnce(fullRegion);

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Sydney CBD', geojson: validPolygon, tenantId: TENANT_A });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Sydney CBD');
  });

  it('AM — creates global region without tenantId', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreate.mockResolvedValueOnce(fullRegion);

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Global Region', geojson: validPolygon });

    expect(res.status).toBe(201);
  });

  // T126: Create success (OP with ?tenantId)
  it('OP — creates region successfully', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockCreate.mockResolvedValueOnce(fullRegion);

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Sydney CBD', geojson: validPolygon, tenantId: TENANT_A });

    expect(res.status).toBe(201);
  });

  // T126: Create success (CL_ADMIN derives tenantId from JWT)
  it('CL_ADMIN — creates region successfully', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockCreate.mockResolvedValueOnce(fullRegion);

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Sydney CBD', geojson: validPolygon });

    expect(res.status).toBe(201);
  });

  // T123: CL_USER is forbidden
  it('CL_USER — returns 403 Forbidden', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);
    mockCreate.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Forbidden'));

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Test', geojson: validPolygon });

    expect(res.status).toBe(403);
  });

  // T123: INSP is forbidden
  it('INSP — returns 403 Forbidden', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockCreate.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Forbidden'));

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Test', geojson: validPolygon });

    expect(res.status).toBe(403);
  });

  // T121: Name conflict within same tenant
  it('returns 409 when name already exists in same tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreate.mockRejectedValueOnce(new ServiceRegionNameConflictError());

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Sydney CBD', geojson: validPolygon, tenantId: TENANT_A });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_REGION_NAME_CONFLICT');
  });

  it('returns 400 on invalid payload (missing geojson)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Test' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/service-regions — List
// ---------------------------------------------------------------------------

describe('GET /v1/service-regions', () => {
  const paginatedResponse = {
    data: [fullRegion],
    total: 1,
  };

  // T126: CL_ADMIN sees own tenant regions
  it('CL_ADMIN — lists own tenant regions', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockList.mockResolvedValueOnce(paginatedResponse);

    const res = await supertest(app.server)
      .get('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ actor: clAdminContext }),
    );
  });

  // T126: AM sees all (paginated) — tenantId filter optional
  it('AM — lists all regions across tenants', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockList.mockResolvedValueOnce({ data: [fullRegion, { ...fullRegion, id: REGION_ID.replace('a', 'b') }], total: 2 });

    const res = await supertest(app.server)
      .get('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  // T126: OP uses ?tenantId filter
  it('OP — uses tenantId query param to filter by tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockList.mockResolvedValueOnce(paginatedResponse);

    const res = await supertest(app.server)
      .get(`/v1/service-regions?tenantId=${TENANT_A}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });

  // T175: INSP sees only assigned regions
  it('INSP — list is handled by use case (INSP filtering)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockList.mockResolvedValueOnce({ data: [fullRegion], total: 1 });

    const res = await supertest(app.server)
      .get('/v1/service-regions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ actor: inspContext }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await supertest(app.server).get('/v1/service-regions');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/service-regions/:id — Get detail
// ---------------------------------------------------------------------------

describe('GET /v1/service-regions/:id', () => {
  it('AM — returns region detail', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGet.mockResolvedValueOnce(fullRegion);

    const res = await supertest(app.server)
      .get(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(REGION_ID);
  });

  it('returns 404 for unknown region', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGet.mockRejectedValueOnce(new ServiceRegionNotFoundError());

    const res = await supertest(app.server)
      .get(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_REGION_NOT_FOUND');
  });

  it('returns 400 for invalid UUID param', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .get('/v1/service-regions/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/service-regions/:id — Update
// ---------------------------------------------------------------------------

describe('PATCH /v1/service-regions/:id', () => {
  it('AM — updates region name successfully', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdate.mockResolvedValueOnce({ ...fullRegion, name: 'New Name' });

    const res = await supertest(app.server)
      .patch(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  // T126: Name conflict on update
  it('returns 409 on name conflict during update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdate.mockRejectedValueOnce(new ServiceRegionNameConflictError());

    const res = await supertest(app.server)
      .patch(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Existing Name' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_REGION_NAME_CONFLICT');
  });

  // T167: CL_ADMIN cannot update
  it('CL_ADMIN — returns 403 Forbidden', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockUpdate.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Forbidden'));

    const res = await supertest(app.server)
      .patch(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/service-regions/:id/deactivate — Deactivate
// ---------------------------------------------------------------------------

describe('POST /v1/service-regions/:id/deactivate', () => {
  // T167: Deactivate success — no published service groups
  it('AM — deactivates region without published groups', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeactivate.mockResolvedValueOnce({ id: REGION_ID, name: 'Sydney CBD', status: 'INACTIVE', deactivatedAt: new Date().toISOString() });

    const res = await supertest(app.server)
      .post(`/v1/service-regions/${REGION_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
  });

  // T167: Deactivate blocked by published service groups
  it('returns 409 when published service groups reference the region', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeactivate.mockRejectedValueOnce(new ServiceRegionHasPublishedGroupsError());

    const res = await supertest(app.server)
      .post(`/v1/service-regions/${REGION_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Trying to deactivate' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_REGION_HAS_PUBLISHED_GROUPS');
  });

  it('returns 400 when reason is missing', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/service-regions/${REGION_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('empty body with Content-Type: application/json returns 400 (not 500)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post(`/v1/service-regions/${REGION_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .set('Content-Type', 'application/json')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // T167: CL_ADMIN cannot deactivate
  it('CL_ADMIN — returns 403 Forbidden', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockDeactivate.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Forbidden'));

    const res = await supertest(app.server)
      .post(`/v1/service-regions/${REGION_ID}/deactivate`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Test' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/service-regions/:id — Delete
// ---------------------------------------------------------------------------

describe('DELETE /v1/service-regions/:id', () => {
  // T184: Delete inactive region success
  it('AM — deletes inactive region', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDelete.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
  });

  // T184: Cannot delete active region
  it('returns 409 when deleting an active region', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDelete.mockRejectedValueOnce(new ServiceRegionStillActiveError());

    const res = await supertest(app.server)
      .delete(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_REGION_STILL_ACTIVE');
  });

  // T184: Cannot delete region referenced by service groups
  it('returns 404 when region not found (tenant scope enforced)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDelete.mockRejectedValueOnce(new ServiceRegionNotFoundError());

    const res = await supertest(app.server)
      .delete(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  // T184: CL_ADMIN cannot delete
  it('CL_ADMIN — returns 403 Forbidden', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockDelete.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Forbidden'));

    const res = await supertest(app.server)
      .delete(`/v1/service-regions/${REGION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/service-regions/resolve — Resolve
// ---------------------------------------------------------------------------

describe('POST /v1/service-regions/resolve', () => {
  const validAppointmentIds = [
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
  ];

  it('AM — resolves regions for appointments', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockResolve.mockResolvedValueOnce({
      regions: [
        {
          regionId: REGION_ID,
          regionName: 'Sydney CBD',
          color: '#3b82f6',
          matchedAppointmentCount: 1,
          inspectorCount: 3,
        },
      ],
      totalAppointments: 2,
      unmatchedAppointmentIds: [validAppointmentIds[1]],
    });

    const res = await supertest(app.server)
      .post('/v1/service-regions/resolve')
      .set('Authorization', 'Bearer valid-token')
      .send({ appointmentIds: validAppointmentIds });

    expect(res.status).toBe(200);
    expect(res.body.data.regions).toHaveLength(1);
    expect(res.body.data.unmatchedAppointmentIds).toHaveLength(1);
  });

  it('returns 403 for INSP actor', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    mockResolve.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Forbidden'));

    const res = await supertest(app.server)
      .post('/v1/service-regions/resolve')
      .set('Authorization', 'Bearer valid-token')
      .send({ appointmentIds: validAppointmentIds });

    expect(res.status).toBe(403);
  });

  it('returns 400 on empty appointmentIds', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .post('/v1/service-regions/resolve')
      .set('Authorization', 'Bearer valid-token')
      .send({ appointmentIds: [] });

    expect(res.status).toBe(400);
  });

  // Regression: OP must be able to resolve regions for a selected tenant per DEC-003.
  // The use case already accepts `tenantId` from the body for AM/OP; this test locks it in.
  it('OP — passes body.tenantId to the use case for cross-tenant resolve', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockResolve.mockResolvedValueOnce({
      regions: [
        {
          regionId: REGION_ID,
          regionName: 'Sydney CBD',
          color: '#3b82f6',
          matchedAppointmentCount: 1,
          inspectorCount: 2,
        },
      ],
      totalAppointments: 1,
      unmatchedAppointmentIds: [],
    });

    const res = await supertest(app.server)
      .post('/v1/service-regions/resolve')
      .set('Authorization', 'Bearer valid-token')
      .send({ appointmentIds: validAppointmentIds, tenantId: TENANT_A });

    expect(res.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        actor: expect.objectContaining({ role: 'OP' }),
      }),
    );
  });

  it('AM — passes body.tenantId to the use case for cross-tenant resolve', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockResolve.mockResolvedValueOnce({ regions: [], totalAppointments: 0, unmatchedAppointmentIds: [] });

    const res = await supertest(app.server)
      .post('/v1/service-regions/resolve')
      .set('Authorization', 'Bearer valid-token')
      .send({ appointmentIds: validAppointmentIds, tenantId: TENANT_B });

    expect(res.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_B,
        actor: expect.objectContaining({ role: 'AM' }),
      }),
    );
  });

  // CL roles must not be able to cross tenant via the body. The route forwards the
  // input tenantId to the use case; the use case authorization (resolveTenantId)
  // enforces that CL roles must match their JWT tenantId. We assert here that the
  // use case throws ForbiddenError when CL_ADMIN of TENANT_A sends body tenantId=B.
  it('CL_ADMIN with body.tenantId ≠ JWT → 403 (use case enforces match)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext); // tenantId = TENANT_A
    mockResolve.mockRejectedValueOnce(new ForbiddenError('AUTH_FORBIDDEN', 'Cross-tenant access is forbidden'));

    const res = await supertest(app.server)
      .post('/v1/service-regions/resolve')
      .set('Authorization', 'Bearer valid-token')
      .send({ appointmentIds: validAppointmentIds, tenantId: TENANT_B });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant isolation
// ---------------------------------------------------------------------------

describe('Multi-tenant isolation', () => {
  it('CL_ADMIN of tenant A cannot see a region of tenant B (404)', async () => {
    // The use case returns null for cross-tenant lookup → route throws NotFound
    mockJwtVerify.mockResolvedValueOnce(clAdminContext); // tenantId = TENANT_A
    mockGet.mockRejectedValueOnce(new ServiceRegionNotFoundError());

    const regionOfTenantB = '33333333-3333-3333-3333-333333333333';

    const res = await supertest(app.server)
      .get(`/v1/service-regions/${regionOfTenantB}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('CL_ADMIN of tenant A cannot update a region of tenant B (404)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext); // tenantId = TENANT_A
    mockUpdate.mockRejectedValueOnce(new ServiceRegionNotFoundError());

    const regionOfTenantB = '33333333-3333-3333-3333-333333333333';

    const res = await supertest(app.server)
      .patch(`/v1/service-regions/${regionOfTenantB}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Hack' });

    expect(res.status).toBe(404);
  });
});
