/**
 * Route-level auth + wiring for /v1/integrations/fy/*. The Fy API is
 * machine-only: an API key carrying the bot:fy scope is required — no key
 * → 401 via key path or 403 via JWT path (JWT principals have no scopes);
 * key without the scope → 403.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createHash } from 'node:crypto';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';
import { createApiKeyAuthMiddleware } from '../../../src/shared/interfaces/api-key-auth-middleware';
import { UnauthorizedError } from '../../../src/shared/domain/errors';

const mockByPhone = vi.fn();
const mockDetail = vi.fn();
const mockAgency = vi.fn();
const mockDates = vi.fn();
const mockNote = vi.fn();
const mockContact = vi.fn();
const mockResend = vi.fn();
const mockJwtVerify = vi.fn();
const mockFindByHash = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () => {
    const jwtAuthenticate = async (request: any) => {
      request.authContext = await mockJwtVerify();
    };
    return createMockContainer({
      fy: {
        apiKeyAuthenticate: createApiKeyAuthMiddleware(
          { findByHash: mockFindByHash, touchLastUsed: vi.fn(async () => {}) },
          jwtAuthenticate,
        ),
        findFyAppointmentsByPhoneUseCase: { execute: mockByPhone },
        getFyAppointmentUseCase: { execute: mockDetail },
        getFyAgencyUseCase: { execute: mockAgency },
        getFyAvailableDatesUseCase: { execute: mockDates },
        addFyAppointmentNoteUseCase: { execute: mockNote },
        updateFyAppointmentContactUseCase: { execute: mockContact },
        resendFyNoticeUseCase: { execute: mockResend },
      },
    });
  },
}));

const PLAINTEXT = 'pfy_test-key';
const KEY_HASH = createHash('sha256').update(PLAINTEXT).digest('hex');

function fyKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    name: 'fy',
    keyHash: KEY_HASH,
    prefix: 'pfy_test',
    role: 'OP',
    scopes: ['bot:fy'],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: new Date(),
    createdById: 'am-1',
    createdAt: new Date(),
    ...overrides,
  };
}

const APPT_ID = 'a0000000-0000-4000-8000-000000000001';

const summary = {
  id: APPT_ID,
  code: 'INS-0042',
  status: 'SCHEDULED',
  serviceType: { id: 'b0000000-0000-4000-8000-000000000001', name: 'Routine Inspection' },
  scheduledDate: '2026-08-10',
  timeSlotStart: '09:00',
  timeSlotEnd: '12:00',
  propertyAddress: '12 George St, Sydney NSW 2000',
  agency: { id: 'c0000000-0000-4000-8000-000000000001', name: 'Belle Property' },
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
  mockFindByHash.mockImplementation(async (hash: string) => (hash === KEY_HASH ? fyKey() : null));
});

describe('Fy auth gate', () => {
  it('401 without any credentials nor JWT', async () => {
    mockJwtVerify.mockRejectedValue(new UnauthorizedError('AUTH_UNAUTHORIZED', 'Missing token'));
    const res = await supertest(app.server).get(
      `/v1/integrations/fy/appointments/${APPT_ID}`,
    );
    expect(res.status).toBe(401);
    expect(mockDetail).not.toHaveBeenCalled();
  });

  it('401 for an unknown or revoked API key', async () => {
    await supertest(app.server)
      .get(`/v1/integrations/fy/appointments/${APPT_ID}`)
      .set('X-API-Key', 'pfy_bogus')
      .expect(401);

    mockFindByHash.mockResolvedValue(fyKey({ revokedAt: new Date() }));
    await supertest(app.server)
      .get(`/v1/integrations/fy/appointments/${APPT_ID}`)
      .set('X-API-Key', PLAINTEXT)
      .expect(401);
  });

  it('403 for a valid key without the bot:fy scope', async () => {
    mockFindByHash.mockResolvedValue(fyKey({ scopes: [] }));
    const res = await supertest(app.server)
      .get(`/v1/integrations/fy/appointments/${APPT_ID}`)
      .set('X-API-Key', PLAINTEXT)
      .expect(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN_SCOPE');
  });

  it('403 for JWT principals — even AM (machine-only surface)', async () => {
    mockJwtVerify.mockResolvedValue({
      userId: 'am-1',
      tenantId: null,
      role: 'AM',
      branchId: null,
      inspectorId: null,
    });
    await supertest(app.server)
      .get(`/v1/integrations/fy/appointments/${APPT_ID}`)
      .set('Authorization', 'Bearer t')
      .expect(403);
  });
});

describe('Fy routes', () => {
  const auth = (req: supertest.Test) => req.set('X-API-Key', PLAINTEXT);

  it('GET by-contact-phone validates and forwards statusIn with OPEN alias', async () => {
    mockByPhone.mockResolvedValue({
      contact: { name: 'John', email: null, phone: '+61412345678' },
      appointments: [summary],
    });
    const res = await auth(
      supertest(app.server).get(
        '/v1/integrations/fy/appointments/by-contact-phone?phone=%2B61412345678&statusIn=OPEN,SCHEDULED',
      ),
    ).expect(200);
    expect(res.body.data.appointments).toHaveLength(1);
    expect(mockByPhone).toHaveBeenCalledWith({
      phone: '+61412345678',
      statusIn: ['AWAITING_INSPECTOR', 'SCHEDULED'],
    });
  });

  it('GET by-contact-phone 400 on invalid phone', async () => {
    await auth(
      supertest(app.server).get('/v1/integrations/fy/appointments/by-contact-phone?phone=12345'),
    ).expect(400);
    expect(mockByPhone).not.toHaveBeenCalled();
  });

  it('GET appointment detail', async () => {
    mockDetail.mockResolvedValue({
      ...summary,
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      inspector: null,
      agency: { ...summary.agency, timezone: 'Australia/Sydney' },
      contact: { name: 'John', email: null, phone: null, confirmed: false },
      notes: null,
      rentalTenantNote: null,
      confirmationLink: { url: null, expiresAt: null },
    });
    const res = await auth(
      supertest(app.server).get(`/v1/integrations/fy/appointments/${APPT_ID}`),
    ).expect(200);
    expect(res.body.data.confirmationLink).toEqual({ url: null, expiresAt: null });
  });

  it('GET agency card', async () => {
    mockAgency.mockResolvedValue({
      id: summary.agency.id,
      name: 'Belle Property',
      timezone: 'Australia/Sydney',
      branches: [],
    });
    await auth(
      supertest(app.server).get(`/v1/integrations/fy/agencies/${summary.agency.id}`),
    ).expect(200);
  });

  it('GET available-dates clamps limit via schema (400 above 10)', async () => {
    mockDates.mockResolvedValue({ availableDates: [] });
    await auth(
      supertest(app.server).get(
        `/v1/integrations/fy/appointments/${APPT_ID}/available-dates?limit=7`,
      ),
    ).expect(200);
    expect(mockDates).toHaveBeenCalledWith({ appointmentId: APPT_ID, limit: 7 });

    await auth(
      supertest(app.server).get(
        `/v1/integrations/fy/appointments/${APPT_ID}/available-dates?limit=50`,
      ),
    ).expect(400);
  });

  it('POST notes returns 201', async () => {
    mockNote.mockResolvedValue({ content: 'note', createdAt: '2026-07-09T00:00:00.000Z' });
    await auth(supertest(app.server).post(`/v1/integrations/fy/appointments/${APPT_ID}/notes`))
      .send({ content: 'note' })
      .expect(201);
    expect(mockNote).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPT_ID,
        content: 'note',
        actor: expect.objectContaining({ userId: 'api-key:k-1', scopes: ['bot:fy'] }),
      }),
    );
  });

  it('PATCH contact requires at least one field', async () => {
    await auth(supertest(app.server).patch(`/v1/integrations/fy/appointments/${APPT_ID}/contact`))
      .send({})
      .expect(400);

    mockContact.mockResolvedValue({
      contact: { name: 'John A. Smith', email: null, phone: '+61412345678' },
    });
    await auth(supertest(app.server).patch(`/v1/integrations/fy/appointments/${APPT_ID}/contact`))
      .send({ name: 'John A. Smith', phone: '0412345678' })
      .expect(200);
  });

  it('POST resend-notice returns 202 QUEUED', async () => {
    mockResend.mockResolvedValue({ status: 'QUEUED' });
    const res = await auth(
      supertest(app.server).post(`/v1/integrations/fy/appointments/${APPT_ID}/resend-notice`),
    ).expect(202);
    expect(res.body.data.status).toBe('QUEUED');
  });
});
