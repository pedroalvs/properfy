import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Mock functions for inspector execution use cases
const mockGetInspectorScheduleExecute = vi.fn();
const mockGetAppointmentDetailExecute = vi.fn();
const mockStartInspectionExecute = vi.fn();
const mockFinishInspectionExecute = vi.fn();
const mockRequestAssetUploadExecute = vi.fn();
const mockConfirmAssetUploadExecute = vi.fn();
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
      createPropertyUseCase: { execute: vi.fn() },
      getPropertyUseCase: { execute: vi.fn() },
      listPropertiesUseCase: { execute: vi.fn() },
      updatePropertyUseCase: { execute: vi.fn() },
      deletePropertyUseCase: { execute: vi.fn() },
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
      getInspectorScheduleUseCase: { execute: mockGetInspectorScheduleExecute },
      getAppointmentDetailUseCase: { execute: mockGetAppointmentDetailExecute },
      startInspectionUseCase: { execute: mockStartInspectionExecute },
      finishInspectionUseCase: { execute: mockFinishInspectionExecute },
      requestAssetUploadUseCase: { execute: mockRequestAssetUploadExecute },
      confirmAssetUploadUseCase: { execute: mockConfirmAssetUploadExecute },
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

const APPOINTMENT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const ASSET_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';

const inspContext = { userId: 'insp-1', tenantId: 'tenant-1', role: 'INSP', branchId: null };

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

describe('GET /v1/inspector/schedule', () => {
  it('should return 200 with schedule data', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const scheduleResult = {
      date: '2026-03-16',
      appointments: [
        {
          id: APPOINTMENT_ID,
          status: 'SCHEDULED',
          scheduledDate: '2026-03-16',
          timeSlot: '09:00-10:00',
          serviceTypeId: 'st-1',
          propertyId: 'prop-1',
          tenantConfirmationStatus: 'CONFIRMED',
          keyRequired: false,
          meetingLocation: null,
          executionStatus: 'NOT_STARTED',
        },
      ],
    };
    mockGetInspectorScheduleExecute.mockResolvedValueOnce(scheduleResult);

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.date).toBe('2026-03-16');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get('/v1/inspector/schedule');

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/inspector/appointments/:appointmentId', () => {
  it('should return 200 with appointment detail', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const detailResult = {
      id: APPOINTMENT_ID,
      status: 'SCHEDULED',
      scheduledDate: '2026-03-16',
      timeSlot: '09:00-10:00',
      serviceTypeId: 'st-1',
      propertyId: 'prop-1',
      tenantConfirmationStatus: 'CONFIRMED',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      contact: null,
      restrictions: [],
      execution: null,
      assets: [],
    };
    mockGetAppointmentDetailExecute.mockResolvedValueOnce(detailResult);

    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(APPOINTMENT_ID);
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .get(`/v1/inspector/appointments/${APPOINTMENT_ID}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/inspector/appointments/:appointmentId/start', () => {
  it('should return 201 with execution data', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const startResult = {
      executionId: 'exec-1',
      appointmentId: APPOINTMENT_ID,
      startedAt: '2026-03-16T10:00:00.000Z',
      startLatitude: -33.8688,
      startLongitude: 151.2093,
      status: 'IN_PROGRESS',
    };
    mockStartInspectionExecute.mockResolvedValueOnce(startResult);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'idem-key-1')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(201);
    expect(res.body.data.executionId).toBe('exec-1');
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('should return 400 without Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .set('Authorization', 'Bearer valid-token')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
  });

  it('should return 401 without auth token', async () => {
    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(401);
  });

  it('should return 422 with invalid body (latitude > 90)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/start`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'idem-key-2')
      .send({ latitude: 100, longitude: 151.2093 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /v1/inspector/appointments/:appointmentId/finish', () => {
  it('should return 200 with finish data', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const finishResult = {
      executionId: 'exec-1',
      appointmentId: APPOINTMENT_ID,
      startedAt: '2026-03-16T10:00:00.000Z',
      finishedAt: '2026-03-16T11:00:00.000Z',
      appointmentStatus: 'DONE',
      assetsCount: 2,
    };
    mockFinishInspectionExecute.mockResolvedValueOnce(finishResult);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/finish`)
      .set('Authorization', 'Bearer valid-token')
      .set('Idempotency-Key', 'idem-key-3')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(200);
    expect(res.body.data.executionId).toBe('exec-1');
    expect(res.body.data.appointmentStatus).toBe('DONE');
  });

  it('should return 400 without Idempotency-Key header', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/finish`)
      .set('Authorization', 'Bearer valid-token')
      .send({ latitude: -33.8688, longitude: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
  });
});

describe('POST /v1/inspector/appointments/:appointmentId/assets', () => {
  it('should return 201 with presigned URL', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const uploadResult = {
      assetId: ASSET_ID,
      uploadUrl: 'https://stub-storage/inspection-assets/upload?key=some-key',
      storageKey: 'inspections/tenant-1/appt-1/asset-1.jpg',
      expiresAt: '2026-03-16T10:15:00.000Z',
    };
    mockRequestAssetUploadExecute.mockResolvedValueOnce(uploadResult);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/assets`)
      .set('Authorization', 'Bearer valid-token')
      .send({ kind: 'PHOTO', mimeType: 'image/jpeg', fileName: 'photo.jpg' });

    expect(res.status).toBe(201);
    expect(res.body.data.assetId).toBe(ASSET_ID);
    expect(res.body.data).toHaveProperty('uploadUrl');
  });

  it('should return 422 with invalid body (missing kind)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);

    const res = await supertest(app.server)
      .post(`/v1/inspector/appointments/${APPOINTMENT_ID}/assets`)
      .set('Authorization', 'Bearer valid-token')
      .send({ mimeType: 'image/jpeg', fileName: 'photo.jpg' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /v1/inspector/appointments/:appointmentId/assets/:assetId/confirm', () => {
  it('should return 200 with confirmed status', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    const confirmResult = {
      assetId: ASSET_ID,
      status: 'UPLOADED',
      sizeBytes: 1024,
    };
    mockConfirmAssetUploadExecute.mockResolvedValueOnce(confirmResult);

    const res = await supertest(app.server)
      .patch(`/v1/inspector/appointments/${APPOINTMENT_ID}/assets/${ASSET_ID}/confirm`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.assetId).toBe(ASSET_ID);
    expect(res.body.data.status).toBe('UPLOADED');
  });
});
