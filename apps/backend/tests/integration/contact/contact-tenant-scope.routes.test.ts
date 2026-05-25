import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockListContactsExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    contact: {
      listContactsUseCase: { execute: mockListContactsExecute },
      jwtService: { verify: mockJwtVerify },
    },
  }),
}));

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
// Per Constitution v1.3.0 (op_role_rollback), OP is a cross-tenant
// operational role. OP tokens may carry `tenant_id = null` and resolve
// the target tenant from `query.tenantId` / `body.tenantId`.
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

const makeContact = (tenantId: string | null) => ({
  id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a00',
  tenantId,
  type: 'PROPERTY_MANAGER',
  displayName: 'John Smith',
  company: null,
  primaryEmail: 'john@test.com',
  primaryPhone: null,
  additionalChannels: [],
  notes: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const okListResponse = (tenantId: string | null) => ({
  data: [{ contact: makeContact(tenantId), propertyCount: 0, primaryInPropertyCount: 0 }],
  total: 1,
  page: 1,
  pageSize: 20,
});

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockReset();
  mockListContactsExecute.mockReset();
});

/**
 * 024 §FR-303 — visibility model. The route layer no longer enforces tenant
 * scope via TENANT_REQUIRED 400 nor by overwriting `tenantId`. It now passes
 * `actor` (role + JWT tenantId) and the optional `query.tenantId` straight to
 * the use case, which resolves the scope (`resolveScope`) and applies the
 * visibility predicate. CL_* spoofing is still blocked — `resolveScope`
 * ignores the explicit `tenantId` for CL roles. The unit test for
 * `resolveScope` covers that branch; this file pins the route → use case
 * wire shape.
 */
describe('GET /v1/contacts — route → use case scope wire-up (024 §FR-303)', () => {
  describe('AM role', () => {
    it('returns 200 with cross-tenant default when no tenantId query param is provided', async () => {
      mockJwtVerify.mockResolvedValue(amContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_A));

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'AM', tenantId: null },
          tenantId: null,
        }),
      );
    });

    it('passes the tenantId query param straight through (Agency-selector pin)', async () => {
      mockJwtVerify.mockResolvedValue(amContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_A));

      const res = await supertest(app.server)
        .get(`/v1/contacts?tenantId=${TENANT_A}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'AM', tenantId: null },
          tenantId: TENANT_A,
        }),
      );
    });
  });

  describe('OP cross-tenant access (Constitution v1.3.0 — op_role_rollback)', () => {
    it('returns 200 with cross-tenant default when no tenantId query param is provided', async () => {
      mockJwtVerify.mockResolvedValue(opContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_A));

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'OP', tenantId: null },
          tenantId: null,
        }),
      );
    });

    it('passes the tenantId query param straight through to the use case', async () => {
      mockJwtVerify.mockResolvedValue(opContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_B));

      const res = await supertest(app.server)
        .get(`/v1/contacts?tenantId=${TENANT_B}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'OP', tenantId: null },
          tenantId: TENANT_B,
        }),
      );
    });
  });

  describe('CL_ADMIN role (QA-006-CRITICAL-001 regression — spoofing blocked downstream)', () => {
    it('passes actor.tenantId from JWT and the explicit query.tenantId — use case ignores the latter', async () => {
      mockJwtVerify.mockResolvedValue(clAdminContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_A));

      // CL_ADMIN attempts to spoof tenant via query. Route layer faithfully
      // forwards both inputs; the use case (`resolveScope`) ignores
      // `query.tenantId` for CL roles and pins to JWT.
      const res = await supertest(app.server)
        .get(`/v1/contacts?tenantId=${TENANT_B}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'CL_ADMIN', tenantId: TENANT_A },
          tenantId: TENANT_B,
        }),
      );
    });

    it('passes actor.tenantId from JWT when no query param is provided', async () => {
      mockJwtVerify.mockResolvedValue(clAdminContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_A));

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'CL_ADMIN', tenantId: TENANT_A },
          tenantId: null,
        }),
      );
    });
  });

  describe('CL_USER role', () => {
    it('passes actor.tenantId from JWT', async () => {
      mockJwtVerify.mockResolvedValue(clUserContext);
      mockListContactsExecute.mockResolvedValue(okListResponse(TENANT_A));

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { role: 'CL_USER', tenantId: TENANT_A },
          tenantId: null,
        }),
      );
    });
  });
});
