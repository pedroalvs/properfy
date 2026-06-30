/**
 * Integration tests for GET /v1/branches (the flat route used by tenant-selected
 * frontend flows). Asserts the cross-tenant resolution matrix per DEC-003:
 *
 *   AM (tenantId=null in JWT):
 *     - ?tenantId=X → returns X's branches
 *     - no ?tenantId → returns empty list
 *
 *   OP (tenantId=null in JWT):
 *     - ?tenantId=X → returns X's branches  ← regression for the reported bug
 *     - no ?tenantId → returns empty list
 *
 *   CL_ADMIN / CL_USER (tenantId=X in JWT):
 *     - ?tenantId=Y (any value, ≠ JWT) → ignored; returns own tenant's branches
 *
 * The route at apps/backend/src/modules/tenant/interfaces/tenant.routes.ts (the
 * `/v1/branches` handler) gates the query tenantId to AM+OP. CL roles always
 * fall back to JWT tenantId so they cannot cross tenants via the query string.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListBranchesExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: {
      listBranchesUseCase: { execute: mockListBranchesExecute },
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

const TENANT_X = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TENANT_Y = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_X, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_X, role: 'CL_USER', branchId: null, inspectorId: null };

const BRANCH_X = 'c1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b33';
const BRANCH_Y = 'd1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b44';

function branchStub(tenantId: string) {
  return {
    id: tenantId === TENANT_X ? BRANCH_X : BRANCH_Y,
    tenantId,
    name: 'Main Branch',
    addressJson: null,
    contactEmail: null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

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

describe('GET /v1/branches — cross-tenant resolution per DEC-003', () => {
  it('AM with ?tenantId=X → returns X branches', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListBranchesExecute.mockResolvedValueOnce({ data: [branchStub(TENANT_X)], total: 1 });

    const res = await supertest(app.server)
      .get(`/v1/branches?tenantId=${TENANT_X}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockListBranchesExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_X }),
    );
  });

  it('AM without tenantId returns empty list and does not call use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .get('/v1/branches')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockListBranchesExecute).not.toHaveBeenCalled();
  });

  // Regression: the reported bug — OP could not load branches when selecting a tenant.
  it('OP with ?tenantId=X → returns X branches (regression for branches-empty bug)', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockListBranchesExecute.mockResolvedValueOnce({ data: [branchStub(TENANT_X)], total: 1 });

    const res = await supertest(app.server)
      .get(`/v1/branches?tenantId=${TENANT_X}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockListBranchesExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_X, actor: expect.objectContaining({ role: 'OP' }) }),
    );
  });

  it('OP without tenantId returns empty list and does not call use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);

    const res = await supertest(app.server)
      .get('/v1/branches')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockListBranchesExecute).not.toHaveBeenCalled();
  });

  // Cross-tenant containment: CL_ADMIN must not be able to read another tenant's branches
  // by passing a query param. The route must ignore the query for CL roles.
  it('CL_ADMIN with ?tenantId=Y (≠ JWT) → ignores query, returns own tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext); // tenantId = TENANT_X
    mockListBranchesExecute.mockResolvedValueOnce({ data: [branchStub(TENANT_X)], total: 1 });

    const res = await supertest(app.server)
      .get(`/v1/branches?tenantId=${TENANT_Y}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(mockListBranchesExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_X }),
    );
    expect(mockListBranchesExecute).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_Y }),
    );
  });

  it('CL_ADMIN without query → uses own JWT tenantId', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    mockListBranchesExecute.mockResolvedValueOnce({ data: [branchStub(TENANT_X)], total: 1 });

    const res = await supertest(app.server)
      .get('/v1/branches')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(mockListBranchesExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_X }),
    );
  });

  it('CL_USER with ?tenantId=Y (≠ JWT) → ignores query, returns own tenant', async () => {
    mockJwtVerify.mockResolvedValueOnce(clUserContext);
    mockListBranchesExecute.mockResolvedValueOnce({ data: [branchStub(TENANT_X)], total: 1 });

    const res = await supertest(app.server)
      .get(`/v1/branches?tenantId=${TENANT_Y}`)
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(mockListBranchesExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_X }),
    );
  });

  it('unauthenticated → 401', async () => {
    const res = await supertest(app.server).get('/v1/branches');
    expect(res.status).toBe(401);
  });
});
