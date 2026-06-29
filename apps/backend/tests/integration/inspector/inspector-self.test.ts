import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeInspContext, makeAmContext, makeClAdminContext } from '../../helpers/rbac-test-helpers';

const mockGetInspectorExecute = vi.fn();
const mockUpdateInspectorSelfProfileExecute = vi.fn();
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
    inspector: {
      getInspectorUseCase: { execute: mockGetInspectorExecute },
      updateInspectorSelfProfileUseCase: { execute: mockUpdateInspectorSelfProfileExecute },
      jwtService: { verify: mockJwtVerify },
    },
    appointment: { jwtService: { verify: mockJwtVerify } },
    audit: { jwtService: { verify: mockJwtVerify } },
    serviceGroup: { jwtService: { verify: mockJwtVerify } },
    marketplace: { jwtService: { verify: mockJwtVerify } },
    tenantPortal: { jwtService: { verify: mockJwtVerify } },
    inspectorExecution: { jwtService: { verify: mockJwtVerify } },
    billing: { jwtService: { verify: mockJwtVerify } },
    report: { jwtService: { verify: mockJwtVerify } },
    notification: { jwtService: { verify: mockJwtVerify } },
  }),
}));

const INSPECTOR_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66';
const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const INSPECTOR_STUB = {
  id: INSPECTOR_ID,
  name: 'John',
  email: 'john@example.com',
  phone: '+61400000000',
  status: 'ACTIVE',
  regionIds: [],
  serviceTypes: [],
  blockedClients: [],
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

describe('GET /v1/inspectors/me', () => {
  it('returns 200 with inspector data for INSP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    mockGetInspectorExecute.mockResolvedValueOnce(INSPECTOR_STUB);

    const res = await supertest(app.server)
      .get('/v1/inspectors/me')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id', INSPECTOR_ID);
  });

  it('returns 403 for AM (not INSP)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());

    const res = await supertest(app.server)
      .get('/v1/inspectors/me')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext(TENANT_ID));

    const res = await supertest(app.server)
      .get('/v1/inspectors/me')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/inspectors/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/inspectors/me', () => {
  it('returns 200 when INSP updates phone', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    mockUpdateInspectorSelfProfileExecute.mockResolvedValueOnce({ ...INSPECTOR_STUB, phone: '+61400111222' });

    const res = await supertest(app.server)
      .patch('/v1/inspectors/me')
      .set('Authorization', 'Bearer token')
      .send({ phone: '+61400111222' });

    expect(res.status).toBe(200);
  });

  it('returns 200 when INSP updates fullName', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    mockUpdateInspectorSelfProfileExecute.mockResolvedValueOnce({ ...INSPECTOR_STUB, fullName: 'John Smith' });

    const res = await supertest(app.server)
      .patch('/v1/inspectors/me')
      .set('Authorization', 'Bearer token')
      .send({ fullName: 'John Smith' });

    expect(res.status).toBe(200);
  });

  it('returns 403 for AM (not INSP)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());

    const res = await supertest(app.server)
      .patch('/v1/inspectors/me')
      .set('Authorization', 'Bearer token')
      .send({ phone: '+61400111222' });

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .patch('/v1/inspectors/me')
      .send({ phone: '+61400111222' });

    expect(res.status).toBe(401);
  });
});
