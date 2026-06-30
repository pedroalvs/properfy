import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeInspContext, makeClAdminContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockGeneratePhotoUploadUrlExecute = vi.fn();
const mockConfirmPhotoUploadExecute = vi.fn();
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
      generateInspectorPhotoUploadUrlUseCase: { execute: mockGeneratePhotoUploadUrlExecute },
      confirmInspectorPhotoUploadUseCase: { execute: mockConfirmPhotoUploadExecute },
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

describe('POST /v1/inspectors/:inspectorId/photo/presign', () => {
  it('returns 200 with uploadUrl for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGeneratePhotoUploadUrlExecute.mockResolvedValueOnce({
      uploadUrl: 'https://supabase.example/signed-upload',
      storageKey: `inspectors/${INSPECTOR_ID}/avatar.jpg`,
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ mimeType: 'image/jpeg' });

    expect(res.status).toBe(200);
    // UX-baseline cleanup: response is now wrapped in `{ data: {...} }`.
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('uploadUrl');
    expect(res.body.data).toHaveProperty('storageKey');
  });

  it('returns 200 with uploadUrl for OP', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeOpContext());
    mockGeneratePhotoUploadUrlExecute.mockResolvedValueOnce({
      uploadUrl: 'https://supabase.example/signed-upload',
      storageKey: `inspectors/${INSPECTOR_ID}/avatar.png`,
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ mimeType: 'image/png' });

    expect(res.status).toBe(200);
  });

  it('returns 200 for INSP self', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    mockGeneratePhotoUploadUrlExecute.mockResolvedValueOnce({
      uploadUrl: 'https://supabase.example/signed-upload',
      storageKey: `inspectors/${INSPECTOR_ID}/avatar.webp`,
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ mimeType: 'image/webp' });

    expect(res.status).toBe(200);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext(TENANT_ID));
    mockGeneratePhotoUploadUrlExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ mimeType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/presign`)
      .send({ mimeType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID inspector ID', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());

    const res = await supertest(app.server)
      .post('/v1/inspectors/not-a-uuid/photo/presign')
      .set('Authorization', 'Bearer token')
      .send({ mimeType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/inspectors/:inspectorId/photo/confirm', () => {
  it('returns 200 for AM on valid confirm', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockConfirmPhotoUploadExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ storageKey: `inspectors/${INSPECTOR_ID}/avatar.jpg` });

    expect(res.status).toBe(200);
  });

  it('returns 400 when use case throws ValidationError', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { ValidationError } = await import('../../../src/shared/domain/errors');
    mockConfirmPhotoUploadExecute.mockRejectedValueOnce(
      new ValidationError('Invalid storage key format', []),
    );

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ storageKey: 'bad/key.jpg' });

    expect(res.status).toBe(400);
  });
});
