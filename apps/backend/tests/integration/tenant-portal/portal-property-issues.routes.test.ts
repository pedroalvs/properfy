import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { RentalTenantPortalTokenEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.entity';

const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN_ID = '00000000-0000-0000-0000-000000000002';
const FILE_ID = '00000000-0000-0000-0000-0000000000f1';
const ISSUE_ID = '00000000-0000-0000-0000-0000000000e1';

const presign = vi.fn();
const confirm = vi.fn();
const createIssue = vi.fn();
const listIssues = vi.fn();
const findByTokenHash = vi.fn();
const hashToken = vi.fn();
const updateStatus = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      rentalTenantPortal: {
        presignPortalIssuePhotoUseCase: { execute: presign },
        confirmPortalIssuePhotoUseCase: { execute: confirm },
        createPortalIssueUseCase: { execute: createIssue },
        listPortalIssuesUseCase: { execute: listIssues },
        tokenRepo: {
          findByTokenHash,
          findActiveByAppointmentId: vi.fn(),
          save: vi.fn(),
          updateStatus,
          updateLastAccessedAt: vi.fn(),
          tryClaim: vi.fn().mockResolvedValue(true),
          releaseClaim: vi.fn(),
          revokeAllForAppointment: vi.fn(),
          expireActiveTokens: vi.fn(),
        },
        tokenService: { generateRawToken: vi.fn(), hashToken },
      },
    }),
}));

function activeToken(): RentalTenantPortalTokenEntity {
  return new RentalTenantPortalTokenEntity({
    id: TOKEN_ID,
    appointmentId: APPOINTMENT_ID,
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function expiredToken(): RentalTenantPortalTokenEntity {
  return new RentalTenantPortalTokenEntity({
    id: TOKEN_ID,
    appointmentId: APPOINTMENT_ID,
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() - 86_400_000),
    status: 'ACTIVE',
    usedAt: null,
    lastAccessedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

const base = '/v1/rental-tenant-portal/raw-token/property-issues';

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
  hashToken.mockReturnValue('hashed-token');
  findByTokenHash.mockResolvedValue(activeToken());
});

describe('portal property-issue routes (F10-4)', () => {
  it('presign → confirm → create happy path, each scoped to the token appointment', async () => {
    presign.mockResolvedValue({
      fileId: FILE_ID,
      uploadUrl: 'https://storage.example.com/signed',
      expiresAt: '2026-11-08T00:15:00.000Z',
    });
    confirm.mockResolvedValue({
      id: FILE_ID,
      fileName: 'leak.jpg',
      mime: 'image/jpeg',
      status: 'PENDING',
      createdAt: '2026-11-08T00:00:00.000Z',
    });
    createIssue.mockResolvedValue({
      id: ISSUE_ID,
      reason: 'The gate will not lock',
      createdAt: '2026-11-08T00:00:00.000Z',
      photos: [
        {
          id: FILE_ID,
          fileName: 'leak.jpg',
          mime: 'image/jpeg',
          status: 'READY',
          createdAt: '2026-11-08T00:00:00.000Z',
        },
      ],
    });

    const presignRes = await supertest(app.server)
      .post(`${base}/presign`)
      .send({ fileName: 'leak.jpg', mime: 'image/jpeg' });
    expect(presignRes.status).toBe(201);
    expect(presignRes.body).not.toHaveProperty('storageKey');
    expect(presign).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: APPOINTMENT_ID }),
    );

    const confirmRes = await supertest(app.server)
      .post(`${base}/confirm-upload`)
      .set('Idempotency-Key', 'idem-confirm-1')
      .send({ fileId: FILE_ID });
    expect(confirmRes.status).toBe(200);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPOINTMENT_ID,
        fileId: FILE_ID,
        idempotencyKey: 'idem-confirm-1',
      }),
    );

    const createRes = await supertest(app.server)
      .post(base)
      .set('Idempotency-Key', 'idem-create-1')
      .send({ reason: 'The gate will not lock', photoFileIds: [FILE_ID] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.photos).toHaveLength(1);
    // The create response never leaks staff-internal fields.
    expect(createRes.body).not.toHaveProperty('seenByUserId');
    expect(createRes.body).not.toHaveProperty('createdByUserId');
    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPOINTMENT_ID,
        idempotencyKey: 'idem-create-1',
      }),
    );
  });

  it('GET lists only the token appointment reports (scoped by token)', async () => {
    listIssues.mockResolvedValue({ issues: [] });
    const res = await supertest(app.server).get(base);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issues: [] });
    expect(listIssues).toHaveBeenCalledWith({ appointmentId: APPOINTMENT_ID });
  });

  it('refuses writes for a read-only (expired) token but allows the read-only list', async () => {
    findByTokenHash.mockResolvedValue(expiredToken());

    const presignRes = await supertest(app.server)
      .post(`${base}/presign`)
      .send({ fileName: 'leak.jpg', mime: 'image/jpeg' });
    expect(presignRes.status).toBe(403);
    expect(presign).not.toHaveBeenCalled();

    const confirmRes = await supertest(app.server)
      .post(`${base}/confirm-upload`)
      .set('Idempotency-Key', 'x')
      .send({ fileId: FILE_ID });
    expect(confirmRes.status).toBe(403);

    const createRes = await supertest(app.server)
      .post(base)
      .set('Idempotency-Key', 'x')
      .send({ reason: 'leak' });
    expect(createRes.status).toBe(403);

    listIssues.mockResolvedValue({ issues: [] });
    const listRes = await supertest(app.server).get(base);
    expect(listRes.status).toBe(200);
  });

  it('enforces the per-token presign ceiling: 12 succeed, the 13th is 429 (D21)', async () => {
    // A distinct token hash isolates this bucket from the other tests.
    hashToken.mockReturnValue('rate-limit-token');
    presign.mockResolvedValue({
      fileId: FILE_ID,
      uploadUrl: 'https://storage.example.com/signed',
      expiresAt: '2026-11-08T00:15:00.000Z',
    });

    const body = { fileName: 'leak.jpg', mime: 'image/jpeg' };
    for (let i = 0; i < 12; i++) {
      const res = await supertest(app.server).post(`${base}/presign`).send(body);
      expect(res.status).toBe(201);
    }
    const blocked = await supertest(app.server).post(`${base}/presign`).send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('rejects an invalid presign body (empty fileName)', async () => {
    const res = await supertest(app.server)
      .post(`${base}/presign`)
      .send({ fileName: '', mime: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(presign).not.toHaveBeenCalled();
  });
});
