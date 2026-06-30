import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeInspContext, makeAmContext, makeOpContext, makeClAdminContext, makeClUserContext } from '../../helpers/rbac-test-helpers';

const mockGetTemplateExecute = vi.fn();
const mockUpdateTemplateExecute = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    auth: { jwtService: { verify: mockJwtVerify } },
    tenant: { jwtService: { verify: mockJwtVerify } },
    user: { jwtService: { verify: mockJwtVerify } },
    property: { jwtService: { verify: mockJwtVerify } },
    serviceType: { jwtService: { verify: mockJwtVerify } },
    pricingRule: { jwtService: { verify: mockJwtVerify } },
    inspector: {
      getInspectorAvailabilityTemplateUseCase: { execute: mockGetTemplateExecute },
      updateInspectorAvailabilityTemplateUseCase: { execute: mockUpdateTemplateExecute },
      jwtService: { verify: mockJwtVerify },
    },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    rentalTenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
    dashboard: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const INSP_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

const TEMPLATE_RESPONSE = {
  template: { mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF },
  overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF },
};

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['CORS_ORIGIN'] = 'http://localhost:5173';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => { await app.close(); });
beforeEach(() => { vi.clearAllMocks(); });

// ── Regression gate for T002 ──────────────────────────────────────────────────

describe('GET /v1/inspectors/me/availability-template', () => {
  it('returns 200 with template+overrides composite shape for INSP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSP_ID));
    mockGetTemplateExecute.mockResolvedValueOnce(TEMPLATE_RESPONSE);

    const res = await supertest(app.server)
      .get('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.template).toBeDefined();
    expect(res.body.data.overrides).toBeDefined();
    expect(res.body.data.template.mon).toEqual(ON);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await supertest(app.server)
      .get('/v1/inspectors/me/availability-template');
    expect(res.status).toBe(401);
  });

  it('returns 403 for AM role', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const res = await supertest(app.server)
      .get('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 403 for OP role', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeOpContext());
    const res = await supertest(app.server)
      .get('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 403 for CL_ADMIN role', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext('tenant-1'));
    const res = await supertest(app.server)
      .get('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 403 for CL_USER role', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClUserContext('tenant-1'));
    const res = await supertest(app.server)
      .get('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });
});

describe('PUT /v1/inspectors/me/availability-template', () => {
  const UPDATE_BODY = {
    template: { mon: ON, tue: ON, wed: ON, thu: ON, fri: ON, sat: OFF, sun: OFF },
  };

  it('returns 200 with updated template+overrides for INSP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSP_ID));
    mockUpdateTemplateExecute.mockResolvedValueOnce(TEMPLATE_RESPONSE);

    const res = await supertest(app.server)
      .put('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token')
      .send(UPDATE_BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.template).toBeDefined();
    expect(res.body.data.overrides).toBeDefined();
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await supertest(app.server)
      .put('/v1/inspectors/me/availability-template')
      .send(UPDATE_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 403 for AM role on PUT', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const res = await supertest(app.server)
      .put('/v1/inspectors/me/availability-template')
      .set('Authorization', 'Bearer token')
      .send(UPDATE_BODY);
    expect(res.status).toBe(403);
  });
});
