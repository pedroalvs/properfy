/**
 * T014 (US1) — Integration tests for PUT /v1/notification-templates/:code/:channel
 * and POST /v1/notification-templates/:code/:channel/preview (raw-HTML authoring MVP).
 *
 * Validates: new schema (bodyHtml required, bodyText absent), round-trip, sanitizer
 * rejection surfaced as 422, preview route exists.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { UnprocessableEntityError } from '../../../src/shared/domain/errors';

const mockUpsertExecute = vi.fn();
const mockListTemplatesExecute = vi.fn();
const mockPreviewExecute = vi.fn();
const mockSendTestExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      auditService: { log: mockAuditLog } as never,
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
      contact: { jwtService: { verify: mockJwtVerify } },
      notification: {
        upsertNotificationTemplateUseCase: { execute: mockUpsertExecute },
        listNotificationTemplatesUseCase: { execute: mockListTemplatesExecute },
        renderTemplatePreviewUseCase: { execute: mockPreviewExecute },
        sendTestNotificationUseCase: { execute: mockSendTestExecute },
        jwtService: { verify: mockJwtVerify },
        webhookSignatureValidator: {
          validateResend: vi.fn().mockReturnValue(true),
          validateMobileMessage: vi.fn().mockReturnValue(true),
        },
      },
    }),
}));

const AM_TOKEN = 'Bearer am-token';
const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

const RAW_HTML = '<table><tr><td><strong>Hello {{rentalTenantName}}</strong></td></tr></table>';

const mockTemplateResponse = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  tenantId: null,
  templateCode: 'INSPECTION_NOTICE',
  channel: 'EMAIL',
  subject: 'Notice for {{rentalTenantName}}',
  bodyHtml: RAW_HTML,
  bodyText: 'Hello John',
  variablesJson: ['rentalTenantName'],
  isActive: true,
  notificationClass: 'OPERATIONAL',
  imageBindings: [],
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

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockJwtVerify.mockResolvedValue(amContext);
});

describe('PUT /v1/notification-templates/:templateCode/:channel — raw-HTML authoring', () => {
  it('should accept bodyHtml without bodyText', async () => {
    mockUpsertExecute.mockResolvedValue(mockTemplateResponse);

    const res = await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .set('Authorization', AM_TOKEN)
      .send({ bodyHtml: RAW_HTML, isActive: true });

    expect(res.status).toBe(200);
    expect(mockUpsertExecute).toHaveBeenCalledWith(
      expect.objectContaining({ bodyHtml: RAW_HTML }),
    );
  });

  it('should return 400 when bodyHtml is missing', async () => {
    const res = await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .set('Authorization', AM_TOKEN)
      .send({ isActive: true });

    expect(res.status).toBe(400);
  });

  it('should surface 422 when use case rejects due to sanitizer violation', async () => {
    mockUpsertExecute.mockRejectedValue(
      new UnprocessableEntityError('Body contains unsafe HTML', [
        { code: 'custom', message: 'Disallowed tag: <script>', path: 'bodyHtml' },
      ]),
    );

    const res = await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .set('Authorization', AM_TOKEN)
      .send({ bodyHtml: '<p>Hello</p><script>evil()</script>', isActive: true });

    expect(res.status).toBe(422);
  });

  it('should pass bodyHtml byte-identically to the use case', async () => {
    const exactHtml = '<table><tr><td style="color:#333">Exact HTML body</td></tr></table>';
    mockUpsertExecute.mockResolvedValue({ ...mockTemplateResponse, bodyHtml: exactHtml });

    await supertest(app.server)
      .put('/v1/notification-templates/INSPECTION_NOTICE/EMAIL')
      .set('Authorization', AM_TOKEN)
      .send({ bodyHtml: exactHtml, isActive: true });

    const call = mockUpsertExecute.mock.calls[0]?.[0];
    expect(call?.bodyHtml).toBe(exactHtml);
  });
});

describe('GET /v1/notification-templates — returns bodyHtml on list/detail (Q2)', () => {
  it('should return bodyHtml in the template list response', async () => {
    mockListTemplatesExecute.mockResolvedValue({ data: [mockTemplateResponse] });

    const res = await supertest(app.server)
      .get('/v1/notification-templates')
      .set('Authorization', AM_TOKEN);

    expect(res.status).toBe(200);
    const templates = res.body.data ?? [];
    if (templates.length > 0) {
      expect(templates[0]).toHaveProperty('bodyHtml');
    }
  });
});

describe('POST /v1/notification-templates/:templateCode/:channel/preview — render preview', () => {
  it('should return rendered HTML from the preview endpoint', async () => {
    mockPreviewExecute.mockResolvedValue({
      subjectRendered: 'Notice for John Smith',
      htmlRendered: '<table><tr><td><strong>Hello John Smith</strong></td></tr></table>',
    });

    const res = await supertest(app.server)
      .post('/v1/notification-templates/INSPECTION_NOTICE/EMAIL/preview')
      .set('Authorization', AM_TOKEN)
      .send({ bodyHtml: RAW_HTML });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('htmlRendered');
    expect(res.body.data).toHaveProperty('subjectRendered');
  });
});
