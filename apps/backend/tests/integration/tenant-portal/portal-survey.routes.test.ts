import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { RentalTenantPortalTokenEntity } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.entity';

const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN_ID = '00000000-0000-0000-0000-000000000002';

const mockSubmitSurveyExecute = vi.fn();
const mockConfirmAppointmentExecute = vi.fn();
const mockUpdateContactExecute = vi.fn();
const mockReportUnavailabilityExecute = vi.fn();
const mockJoinGroupExecute = vi.fn();
const mockFindByTokenHash = vi.fn();
const mockHashToken = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      rentalTenantPortal: {
        submitSatisfactionSurveyUseCase: { execute: mockSubmitSurveyExecute },
        confirmAppointmentUseCase: { execute: mockConfirmAppointmentExecute },
        updateContactUseCase: { execute: mockUpdateContactExecute },
        reportUnavailabilityUseCase: { execute: mockReportUnavailabilityExecute },
        joinGroupUseCase: { execute: mockJoinGroupExecute },
        tokenRepo: {
          findByTokenHash: mockFindByTokenHash,
          findActiveByAppointmentId: vi.fn(),
          save: vi.fn(),
          updateStatus: vi.fn(),
          updateLastAccessedAt: vi.fn(),
          tryClaim: vi.fn().mockResolvedValue(true),
          releaseClaim: vi.fn(),
          revokeAllForAppointment: vi.fn(),
          expireActiveTokens: vi.fn(),
        },
        tokenService: { generateRawToken: vi.fn(), hashToken: mockHashToken },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

/**
 * A token in the state the DONE hook leaves it: revived (ACTIVE) and extended to
 * `doneAt + 14d`, but already consumed by the tenant's earlier confirmation.
 */
function createRevivedToken(overrides: Partial<ConstructorParameters<typeof RentalTenantPortalTokenEntity>[0]> = {}) {
  return new RentalTenantPortalTokenEntity({
    id: TOKEN_ID,
    appointmentId: APPOINTMENT_ID,
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 14 * 86400000),
    status: 'ACTIVE',
    usedAt: new Date('2026-08-01T00:00:00.000Z'),
    lastAccessedAt: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date(),
    ...overrides,
  });
}

function setupPortalAuth(token = createRevivedToken()) {
  mockHashToken.mockReturnValue('hashed-token');
  mockFindByTokenHash.mockResolvedValue(token);
}

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

describe('POST /v1/rental-tenant-portal/:token/survey', () => {
  it('submits a rating with a comment', async () => {
    setupPortalAuth();
    mockSubmitSurveyExecute.mockResolvedValueOnce({
      rating: 5,
      comment: 'Very professional.',
      submittedAt: '2026-08-03T10:00:00.000Z',
      alreadySubmitted: false,
    });

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/survey')
      .send({ rating: 5, comment: 'Very professional.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rating: 5,
      comment: 'Very professional.',
      submittedAt: '2026-08-03T10:00:00.000Z',
      alreadySubmitted: false,
    });
    expect(mockSubmitSurveyExecute).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: TOKEN_ID, appointmentId: APPOINTMENT_ID, rating: 5 }),
    );
  });

  it('accepts a rating with no comment', async () => {
    setupPortalAuth();
    mockSubmitSurveyExecute.mockResolvedValueOnce({
      rating: 4,
      comment: null,
      submittedAt: '2026-08-03T10:00:00.000Z',
      alreadySubmitted: false,
    });

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/survey')
      .send({ rating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.comment).toBeNull();
  });

  it('never forwards isUsed to the use case', async () => {
    // A revived token has usedAt set from the tenant's earlier confirmation.
    // Passing that through would let a future guard lock out the happy path.
    setupPortalAuth();
    mockSubmitSurveyExecute.mockResolvedValueOnce({
      rating: 5,
      comment: null,
      submittedAt: '2026-08-03T10:00:00.000Z',
      alreadySubmitted: false,
    });

    await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/survey')
      .send({ rating: 5 });

    expect(mockSubmitSurveyExecute.mock.calls[0][0]).not.toHaveProperty('isUsed');
  });

  it('lets a tenant who already confirmed still submit a rating', async () => {
    setupPortalAuth(createRevivedToken({ usedAt: new Date('2026-08-01T00:00:00.000Z') }));
    mockSubmitSurveyExecute.mockResolvedValueOnce({
      rating: 5,
      comment: null,
      submittedAt: '2026-08-03T10:00:00.000Z',
      alreadySubmitted: false,
    });

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/survey')
      .send({ rating: 5 });

    expect(res.status).toBe(200);
  });

  describe('rejects invalid ratings', () => {
    it.each([
      ['below the scale', 0],
      ['above the scale', 6],
      ['fractional', 3.5],
    ])('%s', async (_label, rating) => {
      setupPortalAuth();

      const res = await supertest(app.server)
        .post('/v1/rental-tenant-portal/valid-raw-token/survey')
        .send({ rating });

      expect(res.status).toBe(400);
      expect(mockSubmitSurveyExecute).not.toHaveBeenCalled();
    });

    it('non-numeric', async () => {
      setupPortalAuth();

      const res = await supertest(app.server)
        .post('/v1/rental-tenant-portal/valid-raw-token/survey')
        .send({ rating: 'five' });

      expect(res.status).toBe(400);
      expect(mockSubmitSurveyExecute).not.toHaveBeenCalled();
    });

    it('missing', async () => {
      setupPortalAuth();

      const res = await supertest(app.server)
        .post('/v1/rental-tenant-portal/valid-raw-token/survey')
        .send({ comment: 'Nice job' });

      expect(res.status).toBe(400);
      expect(mockSubmitSurveyExecute).not.toHaveBeenCalled();
    });
  });

  it('rejects a comment beyond the length cap', async () => {
    setupPortalAuth();

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/survey')
      .send({ rating: 5, comment: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(mockSubmitSurveyExecute).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    mockHashToken.mockReturnValue('hashed-token');
    mockFindByTokenHash.mockResolvedValue(null);

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/bogus-token/survey')
      .send({ rating: 5 });

    expect(res.status).toBe(404);
    expect(mockSubmitSurveyExecute).not.toHaveBeenCalled();
  });

  it('rejects a superseded token', async () => {
    // The middleware hard-rejects SUPERSEDED with 410, which is exactly why the
    // DONE hook must never extend one — the resulting link could not be opened.
    setupPortalAuth(createRevivedToken({ status: 'SUPERSEDED' }));

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/survey')
      .send({ rating: 5 });

    expect(res.status).toBe(410);
    expect(mockSubmitSurveyExecute).not.toHaveBeenCalled();
  });
});

describe('token revival containment', () => {
  /**
   * The survey extends the life of a token the tenant already holds. These cases
   * pin the boundary: reviving the token must open the survey and nothing else.
   *
   * The guards live in the use cases (they block on appointment status), so here
   * we assert the routes still delegate to them — the containment itself is
   * proven by the use-case unit tests, which reject DONE.
   */
  it('still routes confirm through its own guard on a revived token', async () => {
    setupPortalAuth();
    mockConfirmAppointmentExecute.mockRejectedValueOnce(
      Object.assign(new Error('Appointment is no longer active'), {
        code: 'PORTAL_APPOINTMENT_INACTIVE',
        statusCode: 409,
        name: 'ConflictError',
      }),
    );

    const res = await supertest(app.server)
      .post('/v1/rental-tenant-portal/valid-raw-token/confirm')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PORTAL_APPOINTMENT_INACTIVE');
  });

  it('still routes contact updates through their own guard on a revived token', async () => {
    setupPortalAuth();
    mockUpdateContactExecute.mockRejectedValueOnce(
      Object.assign(new Error('Appointment is no longer active'), {
        code: 'PORTAL_APPOINTMENT_INACTIVE',
        statusCode: 409,
        name: 'ConflictError',
      }),
    );

    const res = await supertest(app.server)
      .patch('/v1/rental-tenant-portal/valid-raw-token/contact')
      .send({ primaryEmail: 'new@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PORTAL_APPOINTMENT_INACTIVE');
  });
});
