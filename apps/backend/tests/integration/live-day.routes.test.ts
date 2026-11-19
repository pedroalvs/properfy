/**
 * Live Day route layer (F05-1, test 24/25/26/27): envelope, the response-schema
 * strip of internal fields (SC-008 privacy — `input_fingerprint`/`alert_overrides_json`
 * never escape), query/body validation, and static-route coexistence. RBAC and the
 * domain rules are unit-tested in the use cases; here the use cases are mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/main/server';
import { createMockContainer } from '../helpers/mock-container';

const INSPECTOR_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const mockGetLiveDay = vi.fn();
const mockGetLockedTime = vi.fn();
const mockGetThresholds = vi.fn();
const mockUpdateThresholds = vi.fn();
const mockJwtVerify = vi.fn();

vi.mock('../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      liveDay: {
        getLiveDayUseCase: { execute: mockGetLiveDay },
        getLockedTimeUseCase: { execute: mockGetLockedTime },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
      },
      inspector: {
        getInspectorAlertThresholdsUseCase: { execute: mockGetThresholds },
        updateInspectorAlertThresholdsUseCase: { execute: mockUpdateThresholds },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: vi.fn().mockResolvedValue({ isActive: () => true, settingsJson: {} }) },
      },
    }),
}));

const amContext = { userId: 'u-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

function liveDayInspector(extra: Record<string, unknown> = {}) {
  return {
    inspectorId: INSPECTOR_ID,
    inspectorName: 'Jane',
    state: 'NOT_STARTED',
    lastKnown: { source: 'NONE', lat: null, lng: null, at: null, appointmentId: null, label: null },
    progress: { done: 0, inProgress: 0, remaining: 1, total: 1 },
    delayMinutes: null,
    thresholds: { delayMinutes: 20, delaySource: 'PLATFORM', notStartedMinutes: 30, notStartedSource: 'PLATFORM' },
    alerts: [],
    needsAttention: false,
    dayPlanId: null,
    planStatus: 'NONE',
    planVersion: null,
    routeOutOfDate: false,
    routeApproximate: true,
    routeFeasible: true,
    routeViolations: [],
    origin: null,
    geometryIncluded: false,
    geometry: null,
    stops: [],
    ...extra,
  };
}

function liveDayResponse(inspectors: unknown[]) {
  return {
    date: '2026-11-05',
    today: '2026-11-05',
    timezone: 'Australia/Sydney',
    isToday: true,
    generatedAt: '2026-11-05T02:00:00.000Z',
    thresholdsDefault: { delayMinutes: 20, notStartedMinutes: 30 },
    summary: {
      inspectors: inspectors.length,
      notStarted: inspectors.length,
      atProperty: 0,
      inTransit: 0,
      doneForDay: 0,
      needsAttention: 0,
      stopsDone: 0,
      stopsTotal: inspectors.length,
    },
    inspectors,
  };
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
  mockJwtVerify.mockResolvedValue(amContext);
});

describe('GET /v1/dashboard/live-day', () => {
  it('returns the canonical { data } envelope', async () => {
    mockGetLiveDay.mockResolvedValue({ response: liveDayResponse([liveDayInspector()]) });
    const res = await supertest(app.server).get('/v1/dashboard/live-day').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data.inspectors).toHaveLength(1);
  });

  it('strips internal fields the response schema does not declare (SC-008)', async () => {
    mockGetLiveDay.mockResolvedValue({
      response: liveDayResponse([
        liveDayInspector({ input_fingerprint: 'SECRET', alert_overrides_json: { delayMinutes: 5 } }),
      ]),
    });
    const res = await supertest(app.server).get('/v1/dashboard/live-day?includeGeometry=all').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('input_fingerprint');
    expect(body).not.toContain('alert_overrides_json');
    expect(res.body.data.inspectors[0]).not.toHaveProperty('input_fingerprint');
  });

  it('rejects an invalid date / includeGeometry / inspectorId (400)', async () => {
    for (const q of ['date=05/11/2026', 'includeGeometry=some', 'includeGeometry=selected&inspectorId=not-a-uuid']) {
      const res = await supertest(app.server).get(`/v1/dashboard/live-day?${q}`).set('Authorization', 'Bearer t');
      expect(res.status).toBe(400);
    }
    expect(mockGetLiveDay).not.toHaveBeenCalled();
  });
});

describe('GET /v1/dashboard/locked-time (static route coexistence, test 27)', () => {
  it('resolves independently of live-day with the envelope', async () => {
    mockGetLockedTime.mockResolvedValue({
      response: {
        from: '2026-11-05',
        to: '2026-11-18',
        generatedAt: '2026-11-05T02:00:00.000Z',
        overall: { confirmed: 1, required: 2, percent: 50 },
        byAgency: [],
        byRegion: [],
      },
    });
    const res = await supertest(app.server).get('/v1/dashboard/locked-time').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data.overall).toEqual({ confirmed: 1, required: 2, percent: 50 });
  });
});

describe('alert-thresholds routes (test 26)', () => {
  const body = {
    inspectorId: INSPECTOR_ID,
    platformDefaults: { delayMinutes: 20, notStartedMinutes: 30 },
    override: { delayMinutes: null, notStartedMinutes: null },
    effective: { delayMinutes: 20, notStartedMinutes: 30 },
  };

  it('GET returns the envelope', async () => {
    mockGetThresholds.mockResolvedValue(body);
    const res = await supertest(app.server)
      .get(`/v1/inspectors/${INSPECTOR_ID}/alert-thresholds`)
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.data.effective).toEqual({ delayMinutes: 20, notStartedMinutes: 30 });
  });

  it('PUT accepts a valid strict body', async () => {
    mockUpdateThresholds.mockResolvedValue({ ...body, override: { delayMinutes: 25, notStartedMinutes: 40 } });
    const res = await supertest(app.server)
      .put(`/v1/inspectors/${INSPECTOR_ID}/alert-thresholds`)
      .set('Authorization', 'Bearer t')
      .send({ delayMinutes: 25, notStartedMinutes: 40 });
    expect(res.status).toBe(200);
    expect(res.body.data.override).toEqual({ delayMinutes: 25, notStartedMinutes: 40 });
  });

  it('PUT rejects out-of-range, missing-key and extra-key bodies (400)', async () => {
    for (const bad of [
      { delayMinutes: 4, notStartedMinutes: 40 }, // below 5
      { delayMinutes: 25 }, // missing notStartedMinutes (strict: both required)
      { delayMinutes: 25, notStartedMinutes: 40, extra: 1 }, // .strict() rejects unknown
    ]) {
      const res = await supertest(app.server)
        .put(`/v1/inspectors/${INSPECTOR_ID}/alert-thresholds`)
        .set('Authorization', 'Bearer t')
        .send(bad);
      expect(res.status).toBe(400);
    }
    expect(mockUpdateThresholds).not.toHaveBeenCalled();
  });

  it('a non-uuid inspector id is 400', async () => {
    const res = await supertest(app.server)
      .get('/v1/inspectors/not-a-uuid/alert-thresholds')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
  });
});
