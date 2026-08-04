import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../../src/main/server';
import type { FastifyInstance } from 'fastify';
import { createMockContainer } from '../../helpers/mock-container';

const INSPECTOR_ID = '00000000-0000-0000-0000-000000000001';
const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000002';

const mockListSurveys = vi.fn();
const mockGetAppointmentSurvey = vi.fn();
const mockGetInspector = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      inspector: {
        listInspectorSurveysUseCase: { execute: mockListSurveys },
        getInspectorUseCase: { execute: mockGetInspector },
        jwtService: { verify: mockJwtVerify },
      },
      rentalTenantPortal: {
        getAppointmentSurveyUseCase: { execute: mockGetAppointmentSurvey },
        jwtService: { verify: mockJwtVerify },
      },
    }),
}));

function authAs(role: string, overrides: Record<string, unknown> = {}) {
  mockJwtVerify.mockReturnValue({
    userId: 'user-1',
    tenantId: null,
    role,
    branchId: null,
    inspectorId: null,
    ...overrides,
  });
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
  mockListSurveys.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
  mockGetAppointmentSurvey.mockResolvedValue(null);
});

describe('GET /v1/inspectors/:id/surveys', () => {
  it('returns responses for an operator', async () => {
    authAs('OP');
    mockListSurveys.mockResolvedValue({
      data: [
        {
          rating: 5,
          comment: 'Very professional.',
          submittedAt: '2026-08-03T10:00:00.000Z',
          appointmentCode: 'INS-0042',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/surveys`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    // The standard list envelope: { data: [...], pagination: {...} }. The web
    // side consumes exactly this via usePaginatedQuery, so asserting the real
    // wire shape here is what keeps the two halves from drifting apart.
    expect(res.body.data[0]).toMatchObject({ rating: 5, appointmentCode: 'INS-0042' });
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it('passes the caller through so the use case can pin the tenant scope', async () => {
    authAs('CL_ADMIN', { tenantId: 'tenant-1' });

    await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/surveys`)
      .set('Authorization', 'Bearer token');

    expect(mockListSurveys).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: INSPECTOR_ID,
        actor: expect.objectContaining({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    );
  });

  it('never lets a query parameter override the tenant scope', async () => {
    // A tenantId accepted from the wire would be a cross-tenant read primitive.
    authAs('CL_ADMIN', { tenantId: 'tenant-1' });

    await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/surveys?tenantId=tenant-2`)
      .set('Authorization', 'Bearer token');

    const [call] = mockListSurveys.mock.calls[0];
    expect(call).not.toHaveProperty('tenantId');
    expect(call.actor.tenantId).toBe('tenant-1');
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await supertest(app.server).get(`/v1/inspectors/${INSPECTOR_ID}/surveys`);

    expect(res.status).toBe(401);
    expect(mockListSurveys).not.toHaveBeenCalled();
  });

  it('rejects a malformed inspector id', async () => {
    authAs('AM');

    const res = await supertest(app.server)
      .get('/v1/inspectors/not-a-uuid/surveys')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
    expect(mockListSurveys).not.toHaveBeenCalled();
  });
});

describe('inspector aggregate never carries comments', () => {
  it('exposes only average and counts on the inspector detail', async () => {
    // The anonymity contract at the wire: an inspector reading its own record
    // must learn the score and nothing about who gave it.
    authAs('INSP', { inspectorId: INSPECTOR_ID });
    mockGetInspector.mockResolvedValue({
      id: INSPECTOR_ID,
      name: 'James Roberts',
      email: 'james@example.com',
      phone: null,
      status: 'ACTIVE',
      paymentSettingsJson: {},
      regionIds: [],
      serviceTypesJson: [],
      rating: { average: 4.8, responseCount: 12, doneServicesCount: 245 },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data.rating).toEqual({
      average: 4.8,
      responseCount: 12,
      doneServicesCount: 245,
    });
    expect(JSON.stringify(res.body)).not.toContain('comment');
  });
});

describe('GET /v1/appointments/:appointmentId/survey', () => {
  it('returns the response for an operator', async () => {
    authAs('OP');
    mockGetAppointmentSurvey.mockResolvedValue({
      rating: 4,
      comment: 'On time.',
      submittedAt: '2026-08-03T10:00:00.000Z',
    });

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/survey`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rating: 4, comment: 'On time.' });
  });

  it('returns null when the inspection has no response', async () => {
    // Not a 404: the appointment exists, it simply has not been rated.
    authAs('OP');

    const res = await supertest(app.server)
      .get(`/v1/appointments/${APPOINTMENT_ID}/survey`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await supertest(app.server).get(`/v1/appointments/${APPOINTMENT_ID}/survey`);

    expect(res.status).toBe(401);
    expect(mockGetAppointmentSurvey).not.toHaveBeenCalled();
  });
});
