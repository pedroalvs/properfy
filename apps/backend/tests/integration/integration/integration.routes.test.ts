/**
 * Route-level RBAC + wiring for /v1/integrations and /v1/api-keys.
 * Platform credential management is AM-only: OP, CL_ADMIN, CL_USER and INSP
 * must be rejected with 403. Secrets never appear in responses (masked).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const mockList = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockTest = vi.fn();
const mockStatus = vi.fn();
const mockCreateKey = vi.fn();
const mockListKeys = vi.fn();
const mockRevokeKey = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      integration: {
        listIntegrationsUseCase: { execute: mockList },
        upsertIntegrationSettingUseCase: { execute: mockUpsert },
        deleteIntegrationSettingUseCase: { execute: mockDelete },
        testIntegrationConnectionUseCase: { execute: mockTest },
        integrationConfigResolver: { getStatus: mockStatus, getConfig: vi.fn(), invalidate: vi.fn() },
        createApiKeyUseCase: { execute: mockCreateKey },
        listApiKeysUseCase: { execute: mockListKeys },
        revokeApiKeyUseCase: { execute: mockRevokeKey },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

const amContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const clAdminContext = { userId: 'cl-1', tenantId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'CL_ADMIN', branchId: null, inspectorId: null };

const detail = {
  provider: 'resend',
  configured: true,
  source: 'database',
  enabled: true,
  maskedConfig: { apiKey: '••••abcd', fromEmail: 'no@x.com' },
  updatedAt: '2026-07-07T00:00:00.000Z',
};

const apiKeyRow = {
  id: '7f0c2c6a-6f5c-4b6e-9a44-1f2d3c4b5a69',
  name: 'n8n',
  prefix: 'pfy_ab12cd34',
  role: 'OP',
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: '2026-07-07T00:00:00.000Z',
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

describe('GET /v1/integrations', () => {
  it('AM gets the masked list', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockList.mockResolvedValue([detail]);
    const res = await supertest(app.server)
      .get('/v1/integrations')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data.integrations[0].maskedConfig.apiKey).toBe('••••abcd');
  });

  it.each([
    ['OP', opContext],
    ['CL_ADMIN', clAdminContext],
  ])('%s is rejected with 403', async (_role, ctx) => {
    mockJwtVerify.mockResolvedValue(ctx);
    await supertest(app.server).get('/v1/integrations').set('Authorization', 'Bearer t').expect(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('unauthenticated is rejected with 401', async () => {
    await supertest(app.server).get('/v1/integrations').expect(401);
  });
});

describe('GET /v1/integrations/status', () => {
  it('AM gets status rows', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockStatus.mockResolvedValue([
      { provider: 'resend', configured: false, source: 'none', enabled: true },
    ]);
    const res = await supertest(app.server)
      .get('/v1/integrations/status')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data.integrations[0]).toMatchObject({ provider: 'resend', configured: false });
  });

  it('OP is rejected with 403', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    await supertest(app.server).get('/v1/integrations/status').set('Authorization', 'Bearer t').expect(403);
  });
});

describe('PUT /v1/integrations/:provider', () => {
  it('AM upserts a config', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockUpsert.mockResolvedValue(detail);
    const res = await supertest(app.server)
      .put('/v1/integrations/resend')
      .set('Authorization', 'Bearer t')
      .send({ config: { apiKey: 're_1234abcd', fromEmail: 'no@x.com' } })
      .expect(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'resend', actorId: 'am-1' }),
    );
    expect(JSON.stringify(res.body)).not.toContain('re_1234abcd');
  });

  it('rejects an unknown provider with 400', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    await supertest(app.server)
      .put('/v1/integrations/stripe')
      .set('Authorization', 'Bearer t')
      .send({ config: {} })
      .expect(400);
  });

  it('OP is rejected with 403', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    await supertest(app.server)
      .put('/v1/integrations/resend')
      .set('Authorization', 'Bearer t')
      .send({ config: {} })
      .expect(403);
  });
});

describe('DELETE /v1/integrations/:provider', () => {
  it('AM deletes', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockDelete.mockResolvedValue(undefined);
    const res = await supertest(app.server)
      .delete('/v1/integrations/mapbox')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data.deleted).toBe(true);
  });
});

describe('POST /v1/integrations/:provider/test', () => {
  it('AM runs a connection test', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockTest.mockResolvedValue({ ok: true, message: 'Mapbox access token is valid' });
    const res = await supertest(app.server)
      .post('/v1/integrations/mapbox/test')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data.ok).toBe(true);
  });
});

describe('/v1/api-keys', () => {
  it('AM creates a key and receives the plaintext exactly once (201)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockCreateKey.mockResolvedValue({ ...apiKeyRow, key: 'pfy_plaintextsecret' });
    const res = await supertest(app.server)
      .post('/v1/api-keys')
      .set('Authorization', 'Bearer t')
      .send({ name: 'n8n' })
      .expect(201);
    expect(res.body.data.key).toBe('pfy_plaintextsecret');
    expect(mockCreateKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'n8n', role: 'OP', actorId: 'am-1' }),
    );
  });

  it('list returns rows without any key material', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockListKeys.mockResolvedValue([apiKeyRow]);
    const res = await supertest(app.server)
      .get('/v1/api-keys')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.body.data.apiKeys[0]).not.toHaveProperty('key');
    expect(res.body.data.apiKeys[0]).not.toHaveProperty('keyHash');
  });

  it('revoke works for AM and is 403 for OP', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockRevokeKey.mockResolvedValue({ ...apiKeyRow, revokedAt: '2026-07-07T01:00:00.000Z' });
    await supertest(app.server)
      .post(`/v1/api-keys/${apiKeyRow.id}/revoke`)
      .set('Authorization', 'Bearer t')
      .expect(200);

    mockJwtVerify.mockResolvedValue(opContext);
    await supertest(app.server)
      .post(`/v1/api-keys/${apiKeyRow.id}/revoke`)
      .set('Authorization', 'Bearer t')
      .expect(403);
  });
});
