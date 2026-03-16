import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';

// Mock functions for notification use cases
const mockSendNotificationExecute = vi.fn();
const mockRetryNotificationExecute = vi.fn();
const mockHandleProviderWebhookExecute = vi.fn();
const mockListNotificationsExecute = vi.fn();
const mockGetNotificationExecute = vi.fn();
const mockUpsertNotificationTemplateExecute = vi.fn();
const mockListNotificationTemplatesExecute = vi.fn();
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
      sendNotificationUseCase: { execute: mockSendNotificationExecute },
      retryNotificationUseCase: { execute: mockRetryNotificationExecute },
      handleProviderWebhookUseCase: { execute: mockHandleProviderWebhookExecute },
      listNotificationsUseCase: { execute: mockListNotificationsExecute },
      getNotificationUseCase: { execute: mockGetNotificationExecute },
      upsertNotificationTemplateUseCase: { execute: mockUpsertNotificationTemplateExecute },
      listNotificationTemplatesUseCase: { execute: mockListNotificationTemplatesExecute },
      jwtService: { verify: mockJwtVerify, signAccessToken: vi.fn() },
    },
  }),
}));

const NOTIFICATION_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null };

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

// --- Notifications ---

describe('GET /v1/notifications', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('should return 200 with paginated notifications for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const listResult = {
      data: [
        {
          id: NOTIFICATION_ID,
          tenantId: 'tenant-1',
          appointmentId: 'appt-1',
          recipient: 'test@example.com',
          channel: 'EMAIL',
          templateCode: 'INSPECTION_NOTICE',
          status: 'SENT',
          providerName: 'resend',
          sentAt: '2026-03-16T10:00:00.000Z',
          deliveredAt: null,
          failedAt: null,
          failureReason: null,
          retryCount: 0,
          createdAt: '2026-03-16T09:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mockListNotificationsExecute.mockResolvedValueOnce(listResult);

    const res = await supertest(app.server)
      .get('/v1/notifications')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /v1/notifications/:notificationId', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/notifications/${NOTIFICATION_ID}`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with notification detail for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const detailResult = {
      id: NOTIFICATION_ID,
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
      recipient: 'test@example.com',
      channel: 'EMAIL',
      templateCode: 'INSPECTION_NOTICE',
      status: 'SENT',
      providerName: 'resend',
      providerMessageId: 'msg-123',
      sentAt: '2026-03-16T10:00:00.000Z',
      deliveredAt: null,
      failedAt: null,
      failureReason: null,
      payloadJson: { tenantName: 'John' },
      retryCount: 0,
      nextRetryAt: null,
      createdAt: '2026-03-16T09:00:00.000Z',
      updatedAt: '2026-03-16T10:00:00.000Z',
    };
    mockGetNotificationExecute.mockResolvedValueOnce(detailResult);

    const res = await supertest(app.server)
      .get(`/v1/notifications/${NOTIFICATION_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(NOTIFICATION_ID);
  });
});

describe('POST /v1/notifications/:notificationId/retry', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).post(`/v1/notifications/${NOTIFICATION_ID}/retry`);
    expect(res.status).toBe(401);
  });

  it('should return 200 on successful retry for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const retryResult = {
      notificationId: NOTIFICATION_ID,
      status: 'PENDING',
      retriedAt: '2026-03-16T10:00:00.000Z',
    };
    mockRetryNotificationExecute.mockResolvedValueOnce(retryResult);

    const res = await supertest(app.server)
      .post(`/v1/notifications/${NOTIFICATION_ID}/retry`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
  });
});

// --- Webhooks ---

describe('POST /v1/webhooks/resend', () => {
  it('should return 200 and call handleProviderWebhookUseCase (no auth required)', async () => {
    mockHandleProviderWebhookExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/webhooks/resend')
      .send({ type: 'email.delivered', data: { id: 'msg-123' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockHandleProviderWebhookExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'resend',
        providerMessageId: 'msg-123',
        event: 'delivered',
      }),
    );
  });
});

describe('POST /v1/webhooks/twilio', () => {
  it('should return 200 and call handleProviderWebhookUseCase (no auth required)', async () => {
    mockHandleProviderWebhookExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/webhooks/twilio')
      .send({ MessageSid: 'SM123', MessageStatus: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockHandleProviderWebhookExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'twilio',
        providerMessageId: 'SM123',
        event: 'delivered',
      }),
    );
  });
});

describe('POST /v1/webhooks/zenvia', () => {
  it('should return 200 and call handleProviderWebhookUseCase (no auth required)', async () => {
    mockHandleProviderWebhookExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/webhooks/zenvia')
      .send({ id: 'zen-msg-1', status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockHandleProviderWebhookExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'zenvia',
        providerMessageId: 'zen-msg-1',
        event: 'delivered',
      }),
    );
  });
});

// --- Notification Templates ---

describe('GET /v1/notification-templates', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/notification-templates');
    expect(res.status).toBe(401);
  });

  it('should return 200 with templates for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const listResult = {
      data: [
        {
          id: 'tpl-1',
          tenantId: null,
          templateCode: 'INSPECTION_NOTICE',
          channel: 'EMAIL',
          subject: 'Inspection Notice',
          bodyText: 'Hello {{tenantName}}',
          isActive: true,
          variables: ['tenantName'],
          createdAt: '2026-03-16T00:00:00.000Z',
          updatedAt: '2026-03-16T00:00:00.000Z',
        },
      ],
    };
    mockListNotificationTemplatesExecute.mockResolvedValueOnce(listResult);

    const res = await supertest(app.server)
      .get('/v1/notification-templates')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('PUT /v1/notification-templates/:templateCode/:channel', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .send({ bodyText: 'Hello {{tenantName}}', isActive: true });
    expect(res.status).toBe(401);
  });

  it('should return 200 on successful upsert for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const upsertResult = {
      id: 'tpl-1',
      tenantId: null,
      templateCode: 'INSPECTION_NOTICE',
      channel: 'EMAIL',
      isActive: true,
      updatedAt: '2026-03-16T10:00:00.000Z',
    };
    mockUpsertNotificationTemplateExecute.mockResolvedValueOnce(upsertResult);

    const res = await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .set('Authorization', 'Bearer valid-token')
      .send({ bodyText: 'Hello {{tenantName}}', isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.templateCode).toBe('INSPECTION_NOTICE');
  });
});
