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
// Per Constitution v1.2.0 + correction.op_tenant_scope.contact_routes,
// OP carries a non-null tenantId in the JWT and is tenant-scoped.
const opContext = { userId: 'op-1', tenantId: TENANT_A, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-admin-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const clUserContext = { userId: 'cl-user-1', tenantId: TENANT_A, role: 'CL_USER', branchId: null, inspectorId: null };

const makeContact = (tenantId: string) => ({
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

describe('GET /v1/contacts — tenant scope enforcement (QA-006-CRITICAL-001)', () => {
  describe('AM role', () => {
    it('returns 400 TENANT_REQUIRED when AM provides no tenantId query param', async () => {
      mockJwtVerify.mockResolvedValue(amContext);

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_REQUIRED');
      expect(mockListContactsExecute).not.toHaveBeenCalled();
    });

    it('returns 200 scoped to specified tenantId when AM provides tenantId query param', async () => {
      mockJwtVerify.mockResolvedValue(amContext);
      mockListContactsExecute.mockResolvedValue({
        data: [{ contact: makeContact(TENANT_A), propertyCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await supertest(app.server)
        .get(`/v1/contacts?tenantId=${TENANT_A}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
      );
    });

    it('does not allow AM to query without tenantId even with other query params', async () => {
      mockJwtVerify.mockResolvedValue(amContext);

      const res = await supertest(app.server)
        .get('/v1/contacts?search=john&type=PROPERTY_MANAGER')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_REQUIRED');
      expect(mockListContactsExecute).not.toHaveBeenCalled();
    });
  });

  describe('OP role (Constitution v1.2.0 — correction.op_tenant_scope.contact_routes)', () => {
    it('returns 200 scoped to JWT tenantId without any query param', async () => {
      mockJwtVerify.mockResolvedValue(opContext);
      mockListContactsExecute.mockResolvedValue({
        data: [{ contact: makeContact(TENANT_A), propertyCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
      );
    });

    it('FR-105a regression: OP cannot escape its tenant via tenantId query override', async () => {
      mockJwtVerify.mockResolvedValue(opContext);
      mockListContactsExecute.mockResolvedValue({
        data: [{ contact: makeContact(TENANT_A), propertyCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      // Even when the OP request explicitly asks for TENANT_B, the route
      // MUST scope to the JWT tenantId (TENANT_A).
      const res = await supertest(app.server)
        .get(`/v1/contacts?tenantId=${TENANT_B}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
      );
    });
  });

  describe('CL_ADMIN role', () => {
    it('returns 200 scoped to JWT tenantId regardless of tenantId query param', async () => {
      mockJwtVerify.mockResolvedValue(clAdminContext);
      mockListContactsExecute.mockResolvedValue({
        data: [{ contact: makeContact(TENANT_A), propertyCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      // Even if TENANT_B is passed in query, CL_ADMIN is scoped to TENANT_A from JWT
      const res = await supertest(app.server)
        .get(`/v1/contacts?tenantId=${TENANT_B}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
      );
    });

    it('returns 200 scoped to JWT tenantId with no query param', async () => {
      mockJwtVerify.mockResolvedValue(clAdminContext);
      mockListContactsExecute.mockResolvedValue({
        data: [{ contact: makeContact(TENANT_A), propertyCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
      );
    });
  });

  describe('CL_USER role', () => {
    it('returns 200 scoped to JWT tenantId', async () => {
      mockJwtVerify.mockResolvedValue(clUserContext);
      mockListContactsExecute.mockResolvedValue({
        data: [{ contact: makeContact(TENANT_A), propertyCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await supertest(app.server)
        .get('/v1/contacts')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(mockListContactsExecute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
      );
    });
  });
});

