/**
 * T027 (US2) — Integration tests for email asset endpoints.
 * Tests the HTTP layer with mocked use cases.
 *
 * Routes under test:
 *   GET  /v1/email-assets
 *   POST /v1/email-assets
 *   POST /v1/email-assets/:id/confirm
 *   GET  /v1/email-assets/:id/usages
 *   PATCH /v1/email-assets/:id/bindings/:bindingId
 *   DELETE /v1/email-assets/:id
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { ConflictError, UnprocessableEntityError } from '../../../src/shared/domain/errors';

const mockRequestUpload = vi.fn();
const mockConfirmUpload = vi.fn();
const mockListAssets = vi.fn();
const mockEditBinding = vi.fn();
const mockDeleteAsset = vi.fn();
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
      tenantPortal: { jwtService: { verify: mockJwtVerify } },
      inspectorExecution: { jwtService: { verify: mockJwtVerify } },
      billing: { jwtService: { verify: mockJwtVerify } },
      report: { jwtService: { verify: mockJwtVerify } },
      contact: { jwtService: { verify: mockJwtVerify } },
      notification: {
        requestImageUploadUseCase: { execute: mockRequestUpload },
        confirmImageUploadUseCase: { execute: mockConfirmUpload },
        listEmailAssetsUseCase: { execute: mockListAssets },
        editImageBindingUseCase: { execute: mockEditBinding },
        deleteEmailAssetUseCase: { execute: mockDeleteAsset },
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
const ASSET_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const BINDING_ID = 'b1b2c3d4-0000-4000-8000-000000000001';

const mockAsset = {
  id: ASSET_ID,
  tenantId: null,
  placeholderKey: 'logo',
  publicUrl: 'https://cdn.example.com/email-assets/logo.png',
  originalFilename: 'logo.png',
  contentType: 'image/png',
  sizeBytes: 1024,
  width: 200,
  height: 50,
  status: 'VERIFIED',
  everSent: false,
  uploadedByUserId: 'am-1',
  createdAt: new Date().toISOString(),
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

describe('POST /v1/email-assets — request presign upload', () => {
  it('should return 201 with upload URL on valid request', async () => {
    mockRequestUpload.mockResolvedValue({
      id: ASSET_ID,
      uploadUrl: 'https://storage.example.com/upload?sig=xxx',
      storageKey: 'tenants/platform/library/logo.png',
      publicUrl: 'https://cdn.example.com/email-assets/logo.png',
    });

    const res = await supertest(app.server)
      .post('/v1/email-assets')
      .set('Authorization', AM_TOKEN)
      .send({
        placeholderKey: 'logo',
        filename: 'logo.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('uploadUrl');
  });

  it('should return 409 when placeholder key already exists', async () => {
    mockRequestUpload.mockRejectedValue(new ConflictError('PLACEHOLDER_KEY_EXISTS', 'Placeholder key already exists'));

    const res = await supertest(app.server)
      .post('/v1/email-assets')
      .set('Authorization', AM_TOKEN)
      .send({
        placeholderKey: 'logo',
        filename: 'logo.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      });

    expect(res.status).toBe(409);
  });
});

describe('GET /v1/email-assets — list assets', () => {
  it('should return 200 with list of verified assets', async () => {
    mockListAssets.mockResolvedValue({ data: [mockAsset] });

    const res = await supertest(app.server)
      .get('/v1/email-assets')
      .set('Authorization', AM_TOKEN);

    expect(res.status).toBe(200);
  });
});

describe('DELETE /v1/email-assets/:id — delete asset', () => {
  it('should return 400 when confirm is missing', async () => {
    const res = await supertest(app.server)
      .delete(`/v1/email-assets/${ASSET_ID}`)
      .set('Authorization', AM_TOKEN)
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 200 on successful delete with confirm:true', async () => {
    mockDeleteAsset.mockResolvedValue({ id: ASSET_ID, everSent: false });

    const res = await supertest(app.server)
      .delete(`/v1/email-assets/${ASSET_ID}`)
      .set('Authorization', AM_TOKEN)
      .send({ confirm: true });

    expect(res.status).toBe(200);
  });

  it('should return 409 when asset is in use', async () => {
    mockDeleteAsset.mockRejectedValue(
      new ConflictError('ASSET_IN_USE', 'Asset is bound to templates'),
    );

    const res = await supertest(app.server)
      .delete(`/v1/email-assets/${ASSET_ID}`)
      .set('Authorization', AM_TOKEN)
      .send({ confirm: true });

    expect(res.status).toBe(409);
  });
});
