import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext } from './helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockJwtVerify = vi.fn();
const mockListNotifications = vi.fn();
const mockUpsertTemplate = vi.fn();
const mockListConsents = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
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
    notification: {
      jwtService: { verify: mockJwtVerify },
      listNotificationsUseCase: { execute: mockListNotifications },
      upsertNotificationTemplateUseCase: { execute: mockUpsertTemplate },
      listConsentsByRecipientUseCase: { execute: mockListConsents },
    },
  }),
}));

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ── GET /v1/notifications ─────────────────────────────────────────────────────

describe('GET /v1/notifications — RBAC', () => {
  const listStub = { data: [], total: 0, page: 1, pageSize: 20 };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListNotifications.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/notifications').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListNotifications.mockResolvedValue(listStub);
    const res = await supertest(app.server).get('/v1/notifications').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN (tenant scoping enforced by use case)', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockListNotifications.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/notifications').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListNotifications.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server).get('/v1/notifications').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── PUT /v1/notification-templates/:code/:channel ─────────────────────────────

describe('PUT /v1/notification-templates/:code/:channel — RBAC', () => {
  const templatePayload = {
    subject: 'Test Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    isActive: true,
  };

  const templateStub = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    tenantId: null,
    templateCode: 'appointment_created',
    channel: 'EMAIL',
    subject: 'Test Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    imageBindings: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockUpsertTemplate.mockResolvedValue(templateStub);
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockUpsertTemplate.mockResolvedValue(templateStub);
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(200);
  });

  it('denies CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValue(makeClAdminContext(TENANT_ID));
    mockUpsertTemplate.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(403);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockUpsertTemplate.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .put('/v1/notification-templates/appointment_created/EMAIL')
      .set('Authorization', 'Bearer t').send(templatePayload);
    expect(res.status).toBe(403);
  });
});

// ── GET /v1/notifications/consents ────────────────────────────────────────────

describe('GET /v1/notifications/consents — RBAC', () => {
  it('allows AM', async () => {
    mockJwtVerify.mockResolvedValue(makeAmContext());
    mockListConsents.mockResolvedValue({ consents: [] });
    const res = await supertest(app.server)
      .get('/v1/notifications/consents?recipient=test@example.com')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('allows OP', async () => {
    mockJwtVerify.mockResolvedValue(makeOpContext());
    mockListConsents.mockResolvedValue({ consents: [] });
    const res = await supertest(app.server)
      .get('/v1/notifications/consents?recipient=test@example.com')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('denies CL_USER', async () => {
    mockJwtVerify.mockResolvedValue(makeClUserContext(TENANT_ID));
    mockListConsents.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'Insufficient permissions'));
    const res = await supertest(app.server)
      .get('/v1/notifications/consents?recipient=test@example.com')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});
