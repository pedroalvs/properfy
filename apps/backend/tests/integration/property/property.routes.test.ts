import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Module-level mock functions for property use cases
const mockCreatePropertyExecute = vi.fn();
const mockGetPropertyExecute = vi.fn();
const mockListPropertiesExecute = vi.fn();
const mockUpdatePropertyExecute = vi.fn();
const mockDeletePropertyExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => ({
    prisma: {},
    auditService: { log: mockAuditLog },
    auth: {
      loginUseCase: { execute: vi.fn() },
      refreshTokenUseCase: { execute: vi.fn() },
      logoutUseCase: { execute: vi.fn() },
      getMeUseCase: { execute: vi.fn() },
      changePasswordUseCase: { execute: vi.fn() },
      revokeSessionUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    tenant: {
      createTenantUseCase: { execute: vi.fn() },
      getTenantUseCase: { execute: vi.fn() },
      listTenantsUseCase: { execute: vi.fn() },
      updateTenantUseCase: { execute: vi.fn() },
      deactivateTenantUseCase: { execute: vi.fn() },
      createBranchUseCase: { execute: vi.fn() },
      listBranchesUseCase: { execute: vi.fn() },
      updateBranchUseCase: { execute: vi.fn() },
      deactivateBranchUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    user: {
      createUserUseCase: { execute: vi.fn() },
      getUserUseCase: { execute: vi.fn() },
      listUsersUseCase: { execute: vi.fn() },
      updateUserUseCase: { execute: vi.fn() },
      deactivateUserUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    property: {
      createPropertyUseCase: { execute: mockCreatePropertyExecute },
      getPropertyUseCase: { execute: mockGetPropertyExecute },
      listPropertiesUseCase: { execute: mockListPropertiesExecute },
      updatePropertyUseCase: { execute: mockUpdatePropertyExecute },
      deletePropertyUseCase: { execute: mockDeletePropertyExecute },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    serviceType: {
      createServiceTypeUseCase: { execute: vi.fn() },
      getServiceTypeUseCase: { execute: vi.fn() },
      listServiceTypesUseCase: { execute: vi.fn() },
      updateServiceTypeUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    pricingRule: {
      createPricingRuleUseCase: { execute: vi.fn() },
      listPricingRulesUseCase: { execute: vi.fn() },
      updatePricingRuleUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    inspector: {
      createInspectorUseCase: { execute: vi.fn() },
      getInspectorUseCase: { execute: vi.fn() },
      listInspectorsUseCase: { execute: vi.fn() },
      updateInspectorUseCase: { execute: vi.fn() },
      createAvailabilitySlotUseCase: { execute: vi.fn() },
      listAvailabilitySlotsUseCase: { execute: vi.fn() },
      updateAvailabilitySlotUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    appointment: {
      createAppointmentUseCase: { execute: vi.fn() },
      getAppointmentUseCase: { execute: vi.fn() },
      listAppointmentsUseCase: { execute: vi.fn() },
      updateAppointmentUseCase: { execute: vi.fn() },
      executeStatusTransitionUseCase: { execute: vi.fn() },
      forceManualConfirmationUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    audit: {
      listAuditLogsUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    serviceGroup: {
      createServiceGroupUseCase: { execute: vi.fn() },
      getServiceGroupUseCase: { execute: vi.fn() },
      listServiceGroupsUseCase: { execute: vi.fn() },
      publishServiceGroupUseCase: { execute: vi.fn() },
      assignInspectorManuallyUseCase: { execute: vi.fn() },
      cancelServiceGroupUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    marketplace: {
      getMarketplaceOffersUseCase: { execute: vi.fn() },
      acceptOfferUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    tenantPortal: {
      getPortalDataUseCase: { execute: vi.fn() },
      confirmAppointmentUseCase: { execute: vi.fn() },
      rescheduleRequestUseCase: { execute: vi.fn() },
      updateContactUseCase: { execute: vi.fn() },
      reportUnavailabilityUseCase: { execute: vi.fn() },
      generatePortalTokenUseCase: { execute: vi.fn() },
      tokenRepo: { findByTokenHash: vi.fn(), findActiveByAppointmentId: vi.fn(), save: vi.fn(), updateStatus: vi.fn(), updateLastAccessedAt: vi.fn(), revokeAllForAppointment: vi.fn() },
      tokenService: { generateRawToken: vi.fn(), hashToken: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    inspectorExecution: {
      getInspectorScheduleUseCase: { execute: vi.fn() },
      getAppointmentDetailUseCase: { execute: vi.fn() },
      startInspectionUseCase: { execute: vi.fn() },
      finishInspectionUseCase: { execute: vi.fn() },
      requestAssetUploadUseCase: { execute: vi.fn() },
      confirmAssetUploadUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    billing: {
      createFinancialEntriesOnDoneUseCase: { execute: vi.fn() },
      listFinancialEntriesUseCase: { execute: vi.fn() },
      getFinancialEntryUseCase: { execute: vi.fn() },
      approveFinancialEntryUseCase: { execute: vi.fn() },
      createManualAdjustmentUseCase: { execute: vi.fn() },
      createRefundUseCase: { execute: vi.fn() },
      generateInvoiceUseCase: { execute: vi.fn() },
      listInvoicesUseCase: { execute: vi.fn() },
      getInvoiceUseCase: { execute: vi.fn() },
      downloadInvoiceUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    report: {
      requestReportUseCase: { execute: vi.fn() },
      getReportStatusUseCase: { execute: vi.fn() },
      downloadReportUseCase: { execute: vi.fn() },
      listReportsUseCase: { execute: vi.fn() },
      processReportJobUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
    notification: {
      sendNotificationUseCase: { execute: vi.fn() },
      retryNotificationUseCase: { execute: vi.fn() },
      handleProviderWebhookUseCase: { execute: vi.fn() },
      listNotificationsUseCase: { execute: vi.fn() },
      getNotificationUseCase: { execute: vi.fn() },
      upsertNotificationTemplateUseCase: { execute: vi.fn() },
      listNotificationTemplatesUseCase: { execute: vi.fn() },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PROPERTY_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

const amContext = {
  userId: 'admin-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
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

describe('POST /v1/properties', () => {
  it('should return 201 with valid payload', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreatePropertyExecute.mockResolvedValueOnce({
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
      geocodingStatus: 'PENDING',
      notes: null,
      rulesJson: {},
      createdAt: new Date().toISOString(),
    });

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

  it('should return 422 with invalid payload (missing propertyCode)', async () => {
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

    expect(res.status).toBe(422);
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
      data: [
        {
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
          geocodingStatus: 'PENDING',
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
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
    mockGetPropertyExecute.mockResolvedValueOnce({
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
    });

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

  it('should return 422 with invalid property ID format', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .get('/v1/properties/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(422);
  });
});

describe('PATCH /v1/properties/:propertyId', () => {
  it('should return 200 on successful update', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpdatePropertyExecute.mockResolvedValueOnce({
      id: PROPERTY_ID,
      tenantId: TENANT_ID,
      branchId: null,
      propertyCode: 'PROP-002',
      type: 'RESIDENTIAL',
      street: '123 Main St',
      addressLine2: null,
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocodingStatus: 'PENDING',
      notes: null,
      rulesJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
