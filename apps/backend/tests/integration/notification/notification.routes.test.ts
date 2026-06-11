import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockSendNotificationExecute = vi.fn();
const mockRetryNotificationExecute = vi.fn();
const mockHandleProviderWebhookExecute = vi.fn();
const mockListNotificationsExecute = vi.fn();
const mockGetNotificationExecute = vi.fn();
const mockUpsertNotificationTemplateExecute = vi.fn();
const mockDeleteNotificationTemplateExecute = vi.fn();
const mockListNotificationTemplatesExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auditService: { log: mockAuditLog } as any,
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
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: {
      sendNotificationUseCase: { execute: mockSendNotificationExecute },
      retryNotificationUseCase: { execute: mockRetryNotificationExecute },
      handleProviderWebhookUseCase: { execute: mockHandleProviderWebhookExecute },
      listNotificationsUseCase: { execute: mockListNotificationsExecute },
      getNotificationUseCase: { execute: mockGetNotificationExecute },
      upsertNotificationTemplateUseCase: { execute: mockUpsertNotificationTemplateExecute },
      deleteNotificationTemplateUseCase: { execute: mockDeleteNotificationTemplateExecute },
      listNotificationTemplatesUseCase: { execute: mockListNotificationTemplatesExecute },
      jwtService: { verify: mockJwtVerify },
      webhookSignatureValidator: {
        validateResend: vi.fn().mockReturnValue(true),
        validateMobileMessage: vi.fn().mockReturnValue(true),
      },
    },
  }),
}));

const NOTIFICATION_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => { vi.clearAllMocks(); });

const fullNotification = {
  id: NOTIFICATION_ID,
  tenantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  appointmentId: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
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
  retryCount: 0,
  nextRetryAt: null,
  createdAt: '2026-03-16T09:00:00.000Z',
  updatedAt: '2026-03-16T10:00:00.000Z',
};

const fullTemplate = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  tenantId: null,
  templateCode: 'INSPECTION_NOTICE',
  channel: 'EMAIL',
  subject: 'Inspection Notice',
  bodyHtml: '<p>Hello {{tenantName}}</p>',
  bodyText: 'Hello tenantName',
  variablesJson: ['tenantName'],
  imageBindings: [],
  isActive: true,
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-16T00:00:00.000Z',
};

// --- Notifications ---

describe('GET /v1/notifications', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('should return 200 with paginated notifications for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockListNotificationsExecute.mockResolvedValueOnce({
      data: [fullNotification],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get('/v1/notifications')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /v1/notifications/:notificationId', () => {
  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).get(`/v1/notifications/${NOTIFICATION_ID}`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with notification detail for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockGetNotificationExecute.mockResolvedValueOnce(fullNotification);

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
    mockRetryNotificationExecute.mockResolvedValueOnce({
      ...fullNotification,
      status: 'PENDING',
      retryCount: 1,
    });

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

describe('POST /v1/webhooks/mobile-message', () => {
  it('should return 200 and call handleProviderWebhookUseCase (no auth required)', async () => {
    mockHandleProviderWebhookExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post('/v1/webhooks/mobile-message')
      .send({ message_id: 'mm-msg-1', status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockHandleProviderWebhookExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'mobile-message',
        providerMessageId: 'mm-msg-1',
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
    mockListNotificationTemplatesExecute.mockResolvedValueOnce({
      data: [fullTemplate],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

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
      .send({ bodyHtml: '<p>Hello {{tenantName}}</p>', isActive: true });
    expect(res.status).toBe(401);
  });

  it('should return 200 on successful upsert for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockUpsertNotificationTemplateExecute.mockResolvedValueOnce(fullTemplate);

    const res = await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .set('Authorization', 'Bearer valid-token')
      .send({ bodyHtml: '<p>Hello {{tenantName}}</p>', isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.templateCode).toBe('INSPECTION_NOTICE');
  });
});

describe('DELETE /v1/notification-templates/:templateId', () => {
  const TEMPLATE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  it('should return 401 without auth', async () => {
    const res = await supertest(app.server).delete(`/v1/notification-templates/${TEMPLATE_ID}`);
    expect(res.status).toBe(401);
  });

  it('should return 204 and call the use-case with templateId + actor', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDeleteNotificationTemplateExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .delete(`/v1/notification-templates/${TEMPLATE_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
    expect(mockDeleteNotificationTemplateExecute).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TEMPLATE_ID, actor: amContext }),
    );
  });

  it('should return 400 for a non-uuid templateId', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);

    const res = await supertest(app.server)
      .delete('/v1/notification-templates/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(mockDeleteNotificationTemplateExecute).not.toHaveBeenCalled();
  });
});
