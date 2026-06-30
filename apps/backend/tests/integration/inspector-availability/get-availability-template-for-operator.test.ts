import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import {
  makeAmContext,
  makeOpContext,
  makeInspContext,
  makeClAdminContext,
  makeClUserContext,
} from '../../helpers/rbac-test-helpers';

const mockGetTemplateForOperatorExecute = vi.fn();
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
      getInspectorAvailabilityTemplateForOperatorUseCase: { execute: mockGetTemplateForOperatorExecute },
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

describe('GET /v1/inspectors/:inspectorId/availability-template', () => {
  it('returns 200 with composite template for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGetTemplateForOperatorExecute.mockResolvedValueOnce(TEMPLATE_RESPONSE);

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSP_ID}/availability-template`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.template).toBeDefined();
    expect(res.body.data.overrides).toBeDefined();
    expect(res.body.data.template.mon).toEqual(ON);
  });

  it('returns 200 with composite template for OP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeOpContext());
    mockGetTemplateForOperatorExecute.mockResolvedValueOnce(TEMPLATE_RESPONSE);

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSP_ID}/availability-template`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSP_ID}/availability-template`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext('tenant-1'));
    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSP_ID}/availability-template`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 403 for CL_USER', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClUserContext('tenant-1'));
    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSP_ID}/availability-template`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 403 for INSP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSP_ID));
    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSP_ID}/availability-template`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown inspectorId', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGetTemplateForOperatorExecute.mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { code: 'INSPECTOR_NOT_FOUND', statusCode: 404 }),
    );

    const res = await supertest(app.server)
      .get(`/v1/inspectors/00000000-0000-0000-0000-000000000000/availability-template`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
  });
});
