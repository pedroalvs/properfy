import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';

const presign = vi.fn();
const confirm = vi.fn();
const download = vi.fn();
const createIssue = vi.fn();
const markSeen = vi.fn();
const unseenCount = vi.fn();
const jwtVerify = vi.fn();
const tenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      propertyFile: {
        presignPropertyFileUploadUseCase: { execute: presign },
        confirmPropertyFileUploadUseCase: { execute: confirm },
        getPropertyFileDownloadUrlUseCase: { execute: download },
        jwtService: { verify: jwtVerify },
        tenantRepo: { findById: tenantFindById },
      },
      propertyIssue: {
        createPropertyIssueUseCase: { execute: createIssue },
        markPropertyIssueAsSeenUseCase: { execute: markSeen },
        countUnseenPropertyIssuesUseCase: { execute: unseenCount },
        jwtService: { verify: jwtVerify },
        tenantRepo: { findById: tenantFindById },
      },
    }),
}));

const UUID = '11111111-1111-1111-1111-111111111111';
const USER_UUID = '22222222-2222-2222-2222-222222222222';
const amContext = { userId: USER_UUID, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const validPresignBody = { propertyId: UUID, type: 'DOCUMENT', fileName: 'a.pdf', mime: 'application/pdf' };

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
  tenantFindById.mockResolvedValue({ isActive: () => true });
  jwtVerify.mockResolvedValue(amContext);
});

describe('property-file routes', () => {
  it('401 without a token (valid body passes validation, then auth rejects)', async () => {
    const res = await supertest(app.server).post('/v1/property-files/presign').send(validPresignBody);
    expect(res.status).toBe(401);
    expect(presign).not.toHaveBeenCalled();
  });

  it('POST /v1/property-files/presign → 201', async () => {
    presign.mockResolvedValue({ fileId: UUID, uploadUrl: 'https://u/k', storageKey: 'k', expiresAt: '2026-11-08T00:15:00.000Z' });
    const res = await supertest(app.server)
      .post('/v1/property-files/presign')
      .set('Authorization', 'Bearer t')
      .send(validPresignBody);
    expect(res.status).toBe(201);
    expect(res.body.data.fileId).toBe(UUID);
  });

  it('presign bad body → 400 (schema validation)', async () => {
    const res = await supertest(app.server)
      .post('/v1/property-files/presign')
      .set('Authorization', 'Bearer t')
      .send({ propertyId: 'not-a-uuid', type: 'DOCUMENT', fileName: 'a.pdf', mime: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(presign).not.toHaveBeenCalled();
  });

  it('CL_USER presign → 403 surfaces from the use case', async () => {
    presign.mockRejectedValue(new ForbiddenError('FORBIDDEN', 'nope'));
    const res = await supertest(app.server)
      .post('/v1/property-files/presign')
      .set('Authorization', 'Bearer t')
      .send({ propertyId: UUID, type: 'DOCUMENT', fileName: 'a.pdf', mime: 'application/pdf' });
    expect(res.status).toBe(403);
  });

  it('cross-tenant download → 404 (never reveals existence)', async () => {
    download.mockRejectedValue(new NotFoundError('PROPERTY_FILE_NOT_FOUND', 'Property file not found.'));
    const res = await supertest(app.server)
      .get(`/v1/property-files/${UUID}/download`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(404);
  });
});

describe('property-issue routes', () => {
  it('POST /v1/property-issues → 201', async () => {
    createIssue.mockResolvedValue({ id: UUID, propertyId: UUID, appointmentId: null, reason: 'x', source: 'STAFF', createdByUserId: USER_UUID, cantDoEventId: null, seenAt: null, seenByUserId: null, createdAt: '2026-11-08T00:00:00.000Z', photos: [] });
    const res = await supertest(app.server)
      .post('/v1/property-issues')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'k1')
      .send({ propertyId: UUID, reason: 'Broken window' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(UUID);
    expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'k1' }));
  });

  it('GET /v1/property-issues/unseen-count → 200 (static path not shadowed)', async () => {
    unseenCount.mockResolvedValue({ appointmentsWithUnseenIssues: 2, propertiesWithUnseenIssues: 1 });
    const res = await supertest(app.server)
      .get('/v1/property-issues/unseen-count')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ appointmentsWithUnseenIssues: 2, propertiesWithUnseenIssues: 1 });
  });

  it('POST /v1/property-issues/:id/seen → 200', async () => {
    markSeen.mockResolvedValue({ seen: true, alreadySeen: false, seenAt: '2026-11-08T00:00:00.000Z', seenByUserId: USER_UUID });
    const res = await supertest(app.server)
      .post(`/v1/property-issues/${UUID}/seen`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data.seen).toBe(true);
  });
});
