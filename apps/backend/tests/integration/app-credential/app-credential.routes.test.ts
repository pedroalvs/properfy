/**
 * Route-level RBAC + wiring for /v1/app-credentials.
 * App credentials are an AM/OP-only operational registry (CLAUDE.md §6):
 * CL_ADMIN / CL_USER / INSP must be rejected with 403.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGet = vi.fn();
const mockList = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      appCredential: {
        createAppCredentialUseCase: { execute: mockCreate },
        updateAppCredentialUseCase: { execute: mockUpdate },
        getAppCredentialUseCase: { execute: mockGet },
        listAppCredentialsUseCase: { execute: mockList },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CRED_ID = 'dddddddd-0000-4000-8000-000000000001';

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-1', tenantId: TENANT_A, role: 'CL_ADMIN', branchId: null, inspectorId: null };
const inspContext = { userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'i-1' };

function makeCred(overrides: Record<string, unknown> = {}) {
  return {
    id: CRED_ID, tenantId: TENANT_A, branchId: null, name: 'Airbnb', username: 'host', password: 'secret',
    needsAuthCode: false, authCode: null, appUrl: null, instructionsUrl: null, instructionsPassword: null,
    isActive: true, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

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
  mockJwtVerify.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockGet.mockReset();
  mockList.mockReset();
});

describe('POST /v1/app-credentials', () => {
  it('AM creates and the password is returned in plaintext', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockCreate.mockResolvedValueOnce(makeCred());

    const res = await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({ tenantId: TENANT_A, name: 'Airbnb', username: 'host', password: 'secret' })
      .expect(201);

    expect(res.body.data.password).toBe('secret');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A, name: 'Airbnb' }));
  });

  it('OP is allowed', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockCreate.mockResolvedValueOnce(makeCred());
    await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({ tenantId: TENANT_A, name: 'A', username: 'u', password: 'p' })
      .expect(201);
  });

  it('CL_ADMIN is forbidden (403)', async () => {
    mockJwtVerify.mockResolvedValueOnce(clAdminContext);
    const res = await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({ tenantId: TENANT_A, name: 'A', username: 'u', password: 'p' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid body with 400', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({ tenantId: 'not-a-uuid', name: '', username: 'u', password: 'p' })
      .expect(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects needsAuthCode=true without authCode (400)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({ tenantId: TENANT_A, name: 'A', username: 'u', password: 'p', needsAuthCode: true })
      .expect(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts and echoes the new fields', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const branchId = 'bbbbbbbb-0000-4000-8000-000000000001';
    mockCreate.mockResolvedValueOnce(makeCred({
      branchId, needsAuthCode: true, authCode: '123456',
      appUrl: 'https://example.com/app', instructionsUrl: 'https://example.com/docs',
      instructionsPassword: 'doc-pass',
    }));
    const res = await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({
        tenantId: TENANT_A, branchId, name: 'Airbnb', username: 'host', password: 'secret',
        needsAuthCode: true, authCode: '123456',
        appUrl: 'https://example.com/app', instructionsUrl: 'https://example.com/docs',
        instructionsPassword: 'doc-pass',
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      branchId, needsAuthCode: true, authCode: '123456',
      appUrl: 'https://example.com/app', instructionsUrl: 'https://example.com/docs',
      instructionsPassword: 'doc-pass',
    });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ branchId, needsAuthCode: true }));
  });

  it('rejects an invalid appUrl (400)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    await supertest(app.server)
      .post('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .send({ tenantId: TENANT_A, name: 'A', username: 'u', password: 'p', appUrl: 'not-a-url' })
      .expect(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('GET /v1/app-credentials', () => {
  it('AM lists', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockList.mockResolvedValueOnce({ data: [{ credential: makeCred(), tenantName: 'Agency A' }], total: 1, page: 1, pageSize: 20 });
    const res = await supertest(app.server)
      .get('/v1/app-credentials')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data[0].tenantName).toBe('Agency A');
  });

  it('INSP is forbidden (403)', async () => {
    mockJwtVerify.mockResolvedValueOnce(inspContext);
    await supertest(app.server).get('/v1/app-credentials').set('Authorization', 'Bearer t').expect(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('passes branchId through and returns branchName rows', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    const branchId = 'bbbbbbbb-0000-4000-8000-000000000001';
    mockList.mockResolvedValueOnce({
      data: [{ credential: makeCred({ branchId }), tenantName: 'Agency A', branchName: 'North Sydney' }],
      total: 1, page: 1, pageSize: 20,
    });
    const res = await supertest(app.server)
      .get(`/v1/app-credentials?branchId=${branchId}`)
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ branchId }));
    expect(res.body.data[0].branchName).toBe('North Sydney');
    expect(res.body.data[0].branchId).toBe(branchId);
  });

  it('rejects a non-uuid branchId (400)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    await supertest(app.server)
      .get('/v1/app-credentials?branchId=nope')
      .set('Authorization', 'Bearer t')
      .expect(400);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('POST /v1/app-credentials/:id/deactivate', () => {
  it('OP deactivates → isActive false', async () => {
    mockJwtVerify.mockResolvedValueOnce(opContext);
    mockUpdate.mockResolvedValueOnce(makeCred({ isActive: false }));
    const res = await supertest(app.server)
      .post(`/v1/app-credentials/${CRED_ID}/deactivate`)
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data.isActive).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });
});
