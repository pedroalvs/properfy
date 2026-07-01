import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../helpers/mock-container';
import { NotFoundError } from '../../src/shared/domain/errors';

const mockGetPropertyExecute = vi.fn();
const mockListPropertiesExecute = vi.fn();
const mockGetAppointmentExecute = vi.fn();
const mockExecuteStatusTransitionExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();
const mockTenantFindById = vi.fn().mockResolvedValue({ isActive: () => true });

vi.mock('../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
    auth: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    tenant: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    user: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    property: {
      getPropertyUseCase: { execute: mockGetPropertyExecute },
      listPropertiesUseCase: { execute: mockListPropertiesExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: mockTenantFindById },
    },
    serviceType: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    pricingRule: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    inspector: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    appointment: {
      getAppointmentUseCase: { execute: mockGetAppointmentExecute },
      executeStatusTransitionUseCase: { execute: mockExecuteStatusTransitionExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: mockTenantFindById },
    },
    audit: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    serviceGroup: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    marketplace: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    billing: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    report: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    notification: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
    dashboard: { jwtService: { verify: mockJwtVerify }, tenantRepo: { findById: mockTenantFindById } },
  }),
}));

const TENANT_1_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TENANT_2_ID = 'b1ffcd00-0d1c-5ef9-cc7e-7cc0ce491b22';
const PROPERTY_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const APPOINTMENT_ID = 'd3ffcd00-0d1c-4ef9-8c7e-7cc0ce491b44';

const fullPropertyResponse = (tenantId: string) => ({
  id: PROPERTY_ID,
  tenantId,
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
});

const clAdminTenant1 = {
  userId: 'cl-admin-1',
  tenantId: TENANT_1_ID,
  role: 'CL_ADMIN',
  branchId: null,
  inspectorId: null,
};

const clAdminTenant2 = {
  userId: 'cl-admin-2',
  tenantId: TENANT_2_ID,
  role: 'CL_ADMIN',
  branchId: null,
  inspectorId: null,
};

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

// Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13):
// OP must now carry a tenantId in its JWT. A null-tenant OP is rejected
// by the auth middleware before reaching any use case.
const opContext = {
  userId: 'op-1',
  tenantId: TENANT_1_ID,
  role: 'OP',
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

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantFindById.mockResolvedValue({ isActive: () => true });
});

describe('Multi-tenant isolation', () => {
  describe('Property access isolation', () => {
    it('CL_ADMIN from tenant-1 cannot GET property from tenant-2', async () => {
      mockJwtVerify.mockResolvedValue(clAdminTenant1);
      mockGetPropertyExecute.mockRejectedValueOnce(
        new NotFoundError('PROPERTY_NOT_FOUND', 'Property not found'),
      );

      const res = await supertest(app.server)
        .get(`/v1/properties/${PROPERTY_ID}`)
        .set('Authorization', 'Bearer tenant1-token');

      expect(res.status).toBe(404);
      expect(mockGetPropertyExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: TENANT_1_ID }),
        }),
      );
    });

    it('AM can access property from any tenant', async () => {
      mockJwtVerify.mockResolvedValue(amContext);
      mockGetPropertyExecute.mockResolvedValueOnce(fullPropertyResponse(TENANT_2_ID));

      const res = await supertest(app.server)
        .get(`/v1/properties/${PROPERTY_ID}`)
        .set('Authorization', 'Bearer am-token');

      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(TENANT_2_ID);
    });

    it('OP (tenant-1) can access property in own tenant (CORRECTION-001 close-it)', async () => {
      mockJwtVerify.mockResolvedValue(opContext);
      mockGetPropertyExecute.mockResolvedValueOnce(fullPropertyResponse(TENANT_1_ID));

      const res = await supertest(app.server)
        .get(`/v1/properties/${PROPERTY_ID}`)
        .set('Authorization', 'Bearer op-token');

      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(TENANT_1_ID);
      // The important assertion: OP context carries TENANT_1_ID, not null
      expect(mockGetPropertyExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: TENANT_1_ID, role: 'OP' }),
        }),
      );
    });
  });

  describe('Appointment access isolation', () => {
    it('CL_ADMIN from tenant-1 cannot access appointment from tenant-2', async () => {
      mockJwtVerify.mockResolvedValue(clAdminTenant1);
      mockGetAppointmentExecute.mockRejectedValueOnce(
        new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found'),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}`)
        .set('Authorization', 'Bearer tenant1-token');

      expect(res.status).toBe(404);
      expect(mockGetAppointmentExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: TENANT_1_ID }),
        }),
      );
    });

    it('AM can access appointment from any tenant (use case receives AM context)', async () => {
      mockJwtVerify.mockResolvedValue(amContext);
      // Even if the appointment belongs to tenant-2, AM has no tenantId restriction
      mockGetAppointmentExecute.mockRejectedValueOnce(
        new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found'),
      );

      const res = await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}`)
        .set('Authorization', 'Bearer am-token');

      // The important assertion: AM context (null tenantId) was passed to the use case
      expect(mockGetAppointmentExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: null, role: 'AM' }),
        }),
      );
    });

    it('OP can access appointment in own tenant only (CORRECTION-001 close-it)', async () => {
      mockJwtVerify.mockResolvedValue(opContext);
      mockGetAppointmentExecute.mockRejectedValueOnce(
        new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found'),
      );

      await supertest(app.server)
        .get(`/v1/appointments/${APPOINTMENT_ID}`)
        .set('Authorization', 'Bearer op-token');

      // Sprint 1 W-4-IMPL: OP is tenant-scoped. Its AuthContext carries
      // TENANT_1_ID, not null. The use case receives the tenant-bound OP
      // context, and any appointment outside that tenant returns 404.
      expect(mockGetAppointmentExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: TENANT_1_ID, role: 'OP' }),
        }),
      );
    });
  });

  describe('Cross-tenant request verification', () => {
    it('CL_ADMIN from tenant-2 list only sees own tenant data', async () => {
      mockJwtVerify.mockResolvedValue(clAdminTenant2);
      mockListPropertiesExecute.mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const res = await supertest(app.server)
        .get('/v1/properties')
        .set('Authorization', 'Bearer tenant2-token');

      expect(res.status).toBe(200);
      expect(mockListPropertiesExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: TENANT_2_ID }),
        }),
      );
    });

    it('should reject CL_ADMIN with inactive tenant', async () => {
      mockJwtVerify.mockResolvedValue(clAdminTenant1);
      mockTenantFindById.mockResolvedValue({ isActive: () => false });

      const res = await supertest(app.server)
        .get(`/v1/properties/${PROPERTY_ID}`)
        .set('Authorization', 'Bearer tenant1-token');

      expect(res.status).toBe(401);
    });
  });
});
