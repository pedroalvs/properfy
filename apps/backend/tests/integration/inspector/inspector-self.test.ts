import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeInspContext, makeAmContext, makeClAdminContext } from '../../helpers/rbac-test-helpers';

const mockGetInspectorExecute = vi.fn();
const mockUpdateInspectorSelfProfileExecute = vi.fn();
const mockRecordAppStateExecute = vi.fn();
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
      recordInspectorAppStateUseCase: { execute: mockRecordAppStateExecute },
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

  it('accepts a base address and forwards it to the self-update use case (F01-1)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    mockUpdateInspectorSelfProfileExecute.mockResolvedValueOnce({ inspectorId: INSPECTOR_ID, baseGeocodeFailed: false });
    const address = { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' };
    const res = await supertest(app.server)
      .patch('/v1/inspectors/me')
      .set('Authorization', 'Bearer token')
      .send({ address });
    expect(res.status).toBe(200);
    expect(mockUpdateInspectorSelfProfileExecute.mock.calls[0][0].data.address).toMatchObject({ state: 'NSW' });
  });

  it('rejects a non-AU state in the base address with 400 at address.state (F01-1)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    const res = await supertest(app.server)
      .patch('/v1/inspectors/me')
      .set('Authorization', 'Bearer token')
      .send({ address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'New South Wales', postcode: '2000', country: 'AU' } });
    expect(res.status).toBe(400);
    expect(mockUpdateInspectorSelfProfileExecute).not.toHaveBeenCalled();
  });
});

describe('per-user rate limit on INSP self routes (L-F01-06)', () => {
  const appState = { displayMode: 'standalone', pushPermission: 'granted', appVersion: '0.1.0' };

  function inspCtx(userId: string) {
    return { userId, tenantId: null, role: 'INSP', branchId: null, inspectorId: INSPECTOR_ID };
  }

  it('allows 10 app-state heartbeats per user per minute and 429s the 11th', async () => {
    const userId = `rl-${Math.random().toString(36).slice(2)}`;
    // mockReset (not clear) to drop any mockResolvedValueOnce still queued from a
    // prior test — a stale context would key the first request to another user.
    mockJwtVerify.mockReset();
    mockJwtVerify.mockResolvedValue(inspCtx(userId));
    mockRecordAppStateExecute.mockResolvedValue(undefined);

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await supertest(app.server)
        .post('/v1/inspectors/me/app-state')
        .set('Authorization', 'Bearer token')
        .send(appState);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(204));
    expect(statuses[10]).toBe(429);
  });

  it('keys the limit by user, not IP: two users behind one IP each keep their own budget', async () => {
    const userA = `rl-a-${Math.random().toString(36).slice(2)}`;
    const userB = `rl-b-${Math.random().toString(36).slice(2)}`;
    mockRecordAppStateExecute.mockResolvedValue(undefined);
    // mockReset first so no queued Once context leaks into the first request.
    mockJwtVerify.mockReset();
    // The bearer token selects which user's context authenticate resolves.
    mockJwtVerify.mockImplementation(async (token: string) => inspCtx(token === 'A' ? userA : userB));

    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      for (const token of ['A', 'B']) {
        const res = await supertest(app.server)
          .post('/v1/inspectors/me/app-state')
          .set('Authorization', `Bearer ${token}`)
          .send(appState);
        statuses.push(res.status);
      }
    }
    // 20 requests (10 per user) and not one 429 — the shared IP did not pool them.
    expect(statuses.every((s) => s === 204)).toBe(true);
  });
});
