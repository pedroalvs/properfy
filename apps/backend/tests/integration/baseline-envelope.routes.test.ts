/**
 * UX-baseline cleanup — anti-regression for the response envelope wrap.
 *
 * Pre-fix, six endpoints called `reply.send(result)` without an envelope.
 * Consumers reading `response.data.<field>` would silently see
 * `undefined` (the same class of bug as BUG-023-001 — the regression
 * test for that fix lives at
 * `tests/integration/rental-tenant-portal/rental-tenant-portal.routes.test.ts`).
 * This file pins the canonical `{ data: { ... } }` shape for each
 * endpoint touched by the cleanup.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../helpers/mock-container';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const INSPECTOR_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const mockGetInspectorScheduleExecute = vi.fn();
const mockGenerateInspectorPhotoUploadUrl = vi.fn();
const mockConfirmInspectorPhotoUpload = vi.fn();
const mockGenerateInspectorDocumentUploadUrl = vi.fn();
const mockConfirmInspectorDocumentUpload = vi.fn();
const mockGetInspectorDocumentDownloadUrl = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../src/main/container', () => ({
  createContainer: () => createMockContainer({
    inspectorExecution: {
      getInspectorScheduleUseCase: { execute: mockGetInspectorScheduleExecute },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
    inspector: {
      generateInspectorPhotoUploadUrlUseCase: { execute: mockGenerateInspectorPhotoUploadUrl },
      confirmInspectorPhotoUploadUseCase: { execute: mockConfirmInspectorPhotoUpload },
      generateInspectorDocumentUploadUrlUseCase: { execute: mockGenerateInspectorDocumentUploadUrl },
      confirmInspectorDocumentUploadUseCase: { execute: mockConfirmInspectorDocumentUpload },
      getInspectorDocumentDownloadUrlUseCase: { execute: mockGetInspectorDocumentDownloadUrl },
      jwtService: { verify: mockJwtVerify },
      tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
    },
  }),
}));

const inspContext = {
  userId: 'u-insp-1',
  tenantId: TENANT_ID,
  role: 'INSP',
  branchId: null,
  inspectorId: INSPECTOR_ID,
};
const amContext = {
  userId: 'u-am-1',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
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
  mockJwtVerify.mockReset();
  mockGetInspectorScheduleExecute.mockReset();
  mockGenerateInspectorPhotoUploadUrl.mockReset();
  mockConfirmInspectorPhotoUpload.mockReset();
  mockGenerateInspectorDocumentUploadUrl.mockReset();
  mockConfirmInspectorDocumentUpload.mockReset();
  mockGetInspectorDocumentDownloadUrl.mockReset();
});

describe('UX-baseline envelope — GET /v1/inspector/schedule', () => {
  it('returns the canonical { data } envelope (was bare object pre-fix)', async () => {
    mockJwtVerify.mockResolvedValue(inspContext);
    mockGetInspectorScheduleExecute.mockResolvedValue({
      date: '2026-04-15',
      appointments: [],
    });

    const res = await supertest(app.server)
      .get('/v1/inspector/schedule?date=2026-04-15')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toEqual({ date: '2026-04-15', appointments: [] });
  });
});

describe('UX-baseline envelope — POST /v1/inspectors/:id/photo/presign', () => {
  it('returns the canonical { data } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockGenerateInspectorPhotoUploadUrl.mockResolvedValue({
      uploadUrl: 'https://example.test/upload',
      storageKey: 'inspectors/photos/x.png',
      expiresAt: '2026-04-15T10:00:00.000Z',
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/presign`)
      .set('Authorization', 'Bearer token')
      .send({ mimeType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.uploadUrl).toBe('https://example.test/upload');
    expect(res.body.data.storageKey).toBe('inspectors/photos/x.png');
  });
});

describe('UX-baseline envelope — POST /v1/inspectors/:id/photo/confirm', () => {
  it('returns the canonical { data } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockConfirmInspectorPhotoUpload.mockResolvedValue({
      photoUrl: 'https://example.test/photos/x.png',
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/photo/confirm`)
      .set('Authorization', 'Bearer token')
      .send({ storageKey: 'inspectors/photos/x.png' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.photoUrl).toBe('https://example.test/photos/x.png');
  });
});

describe('UX-baseline envelope — POST /v1/inspectors/:id/documents/presign', () => {
  it('returns the canonical { data } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockGenerateInspectorDocumentUploadUrl.mockResolvedValue({
      uploadUrl: 'https://example.test/upload-doc',
      storageKey: 'inspectors/docs/y.pdf',
      expiresAt: '2026-04-15T10:00:00.000Z',
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/presign`)
      .set('Authorization', 'Bearer token')
      .send({ kind: 'INSURANCE', mimeType: 'application/pdf', fileName: 'insurance.pdf' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.uploadUrl).toBe('https://example.test/upload-doc');
  });
});

describe('UX-baseline envelope — POST /v1/inspectors/:id/documents/confirm', () => {
  it('returns the canonical { data } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockConfirmInspectorDocumentUpload.mockResolvedValue({
      documentId: 'dddddddd-0000-4000-8000-000000000001',
      kind: 'INSURANCE',
    });

    const res = await supertest(app.server)
      .post(`/v1/inspectors/${INSPECTOR_ID}/documents/confirm`)
      .set('Authorization', 'Bearer token')
      .send({
        kind: 'INSURANCE',
        storageKey: 'inspectors/docs/y.pdf',
        fileName: 'insurance.pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.documentId).toBeTruthy();
  });
});

describe('UX-baseline envelope — GET /v1/inspectors/:id/documents/:kind/download', () => {
  it('returns the canonical { data } envelope', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockGetInspectorDocumentDownloadUrl.mockResolvedValue({
      downloadUrl: 'https://example.test/download',
      fileName: 'insurance.pdf',
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/documents/INSURANCE/download`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.downloadUrl).toBe('https://example.test/download');
    expect(res.body.data.fileName).toBe('insurance.pdf');
  });
});
