import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { makeAmContext, makeOpContext, makeInspContext, makeClAdminContext } from '../../helpers/rbac-test-helpers';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockGenerateDocumentUploadUrlExecute = vi.fn();
const mockConfirmDocumentUploadExecute = vi.fn();
const mockGetDocumentDownloadUrlExecute = vi.fn();
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
      generateInspectorDocumentUploadUrlUseCase: { execute: mockGenerateDocumentUploadUrlExecute },
      confirmInspectorDocumentUploadUseCase: { execute: mockConfirmDocumentUploadExecute },
      getInspectorDocumentDownloadUrlUseCase: { execute: mockGetDocumentDownloadUrlExecute },
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

describe('POST /v1/inspectors/:inspectorId/documents/presign', () => {
  it('returns 200 with uploadUrl for AM (INSURANCE)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGenerateDocumentUploadUrlExecute.mockResolvedValueOnce({
      uploadUrl: 'https://supabase.example/signed-upload',
      storageKey: `inspectors/${INSPECTOR_ID}/documents/insurance-uuid.pdf`,
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/presign`)
      .set('Authorization', 'Bearer token')
      .send({ kind: 'INSURANCE', mimeType: 'application/pdf', fileName: 'insurance.pdf' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uploadUrl');
    expect(res.body).toHaveProperty('storageKey');
  });

  it('returns 200 with uploadUrl for OP (POLICE_CHECK)', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeOpContext());
    mockGenerateDocumentUploadUrlExecute.mockResolvedValueOnce({
      uploadUrl: 'https://supabase.example/signed-upload',
      storageKey: `inspectors/${INSPECTOR_ID}/documents/police-uuid.pdf`,
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/presign`)
      .set('Authorization', 'Bearer token')
      .send({ kind: 'POLICE_CHECK', mimeType: 'application/pdf', fileName: 'police.pdf' });

    expect(res.status).toBe(200);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext(TENANT_ID));
    mockGenerateDocumentUploadUrlExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/presign`)
      .set('Authorization', 'Bearer token')
      .send({ kind: 'INSURANCE', mimeType: 'application/pdf', fileName: 'insurance.pdf' });

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/presign`)
      .send({ kind: 'INSURANCE', mimeType: 'application/pdf', fileName: 'insurance.pdf' });

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/inspectors/:inspectorId/documents/confirm', () => {
  it('returns 200 for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockConfirmDocumentUploadExecute.mockResolvedValueOnce(undefined);

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ kind: 'INSURANCE', storageKey: `inspectors/${INSPECTOR_ID}/documents/insurance-uuid.pdf`, fileName: 'insurance.pdf' });

    expect(res.status).toBe(200);
  });

  it('returns 400 when ValidationError thrown', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    const { ValidationError } = await import('../../../src/shared/domain/errors');
    mockConfirmDocumentUploadExecute.mockRejectedValueOnce(
      new ValidationError('Object not found in storage', []),
    );

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ kind: 'INSURANCE', storageKey: 'bad/key.pdf', fileName: 'bad.pdf' });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/inspectors/:inspectorId/documents/:kind/download', () => {
  it('returns 200 with downloadUrl for AM', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeAmContext());
    mockGetDocumentDownloadUrlExecute.mockResolvedValueOnce({
      downloadUrl: 'https://supabase.example/signed-download',
      fileName: 'insurance.pdf',
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/documents/INSURANCE/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('downloadUrl');
  });

  it('returns 200 with downloadUrl for INSP self', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeInspContext(INSPECTOR_ID));
    mockGetDocumentDownloadUrlExecute.mockResolvedValueOnce({
      downloadUrl: 'https://supabase.example/signed-download',
      fileName: 'police.pdf',
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/documents/POLICE_CHECK/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });

  it('returns 403 for CL_ADMIN', async () => {
    mockJwtVerify.mockResolvedValueOnce(makeClAdminContext(TENANT_ID));
    mockGetDocumentDownloadUrlExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions'),
    );

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/documents/INSURANCE/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/documents/INSURANCE/download`);

    expect(res.status).toBe(401);
  });
});
