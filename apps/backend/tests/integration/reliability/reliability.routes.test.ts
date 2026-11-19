import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import {
  RELIABILITY_METRIC_KEYS,
  inspectorReliabilityResponseSchema,
  reliabilityRankingResponseSchema,
  successResponseSchema,
} from '@properfy/shared';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError, NotFoundError } from '../../../src/shared/domain/errors';

const mockRankingExecute = vi.fn();
const mockDetailExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      reliability: {
        getRankingUseCase: { execute: mockRankingExecute },
        getInspectorReliabilityUseCase: { execute: mockDetailExecute },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const INSPECTOR_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ADDRESS = '742 Evergreen Terrace, Springfield';

const rankingPayload = {
  snapshotDate: '2026-12-01',
  windowFrom: '2026-11-01',
  windowTo: '2026-11-30',
  computedAt: '2026-11-30T17:15:04.000Z',
  isStale: false,
  settingsUpdatedAt: null,
  minimumVolume: 10,
  volumeReference: 9.5,
  volumeReferenceSource: 'MEDIAN',
  ranked: [
    { position: 1, inspectorId: INSPECTOR_ID, inspectorName: 'Eva Lima', score: 100, volume: 10, completedCount: 10 },
  ],
  notEnoughData: [
    { inspectorId: '22222222-2222-4222-8222-222222222222', inspectorName: 'Carla Nunes', volume: 9, status: 'INSUFFICIENT_VOLUME' },
  ],
};

// A detail payload deliberately salted with undeclared coordinate/PII keys and 20
// failures: the response schema must strip the extra keys and keep the 8 metrics.
function detailPayload() {
  return {
    inspectorId: INSPECTOR_ID,
    inspectorName: 'Ana Costa',
    inspectorStatus: 'ACTIVE',
    status: 'SCORED',
    snapshotDate: '2026-12-01',
    windowFrom: '2026-11-01',
    windowTo: '2026-11-30',
    computedAt: '2026-11-30T17:15:04.000Z',
    isStale: false,
    settingsUpdatedAt: null,
    score: 88.3,
    position: 4,
    rankedCount: 5,
    volume: 12,
    completedCount: 12,
    minimumVolume: 10,
    minimumRatings: 3,
    volumeReference: 9.5,
    volumeReferenceSource: 'MEDIAN',
    // leaked PII at the top level — must be stripped
    latitude: -33.8688,
    longitude: 151.2093,
    email: 'ana@example.com',
    phone: '+61400000000',
    metrics: RELIABILITY_METRIC_KEYS.map((metric) => ({
      metric,
      weight: 1,
      rate: 0.9,
      eligibleCount: 20,
      successCount: 18,
      averageRating: null,
      volumeReference: null,
      weightedSuccess: 900,
      weightedEligible: 1000,
      volume: 12,
      activeDays: null,
      failureCount: metric === 'PUNCTUALITY' ? 20 : 0,
      failures:
        metric === 'PUNCTUALITY'
          ? Array.from({ length: 20 }, (_v, i) => ({
              appointmentId: `3333333${i % 10}-3333-4333-8333-333333333333`,
              serviceDate: '2026-11-20',
              detail: `Checked in 11:${10 + (i % 40)}, window 09:00-11:00`,
              // leaked coordinate on a failure — must be stripped
              lat: -33.86,
              lng: 151.2,
            }))
          : [],
    })),
  };
}

function collectKeys(value: unknown, acc: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      collectKeys(v, acc);
    }
  }
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
  mockTenantFindById.mockResolvedValue({ isActive: () => true, settingsJson: {} });
});

describe('GET /v1/dashboard/inspector-performance', () => {
  it('returns 401 without a token', async () => {
    const res = await supertest(app.server).get('/v1/dashboard/inspector-performance');
    expect(res.status).toBe(401);
    expect(mockRankingExecute).not.toHaveBeenCalled();
  });

  it.each([['AM', amContext], ['OP', opContext]])('returns 200 for %s and round-trips the schema', async (_role, ctx) => {
    mockJwtVerify.mockResolvedValueOnce(ctx);
    mockRankingExecute.mockResolvedValueOnce(rankingPayload);
    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-performance')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(successResponseSchema(reliabilityRankingResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data).toEqual(rankingPayload);
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'])('maps the use-case denial for %s onto a 403 FORBIDDEN', async (role) => {
    mockJwtVerify.mockResolvedValueOnce({ userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null });
    mockRankingExecute.mockRejectedValueOnce(new ForbiddenError('FORBIDDEN', 'Role is not permitted'));
    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-performance')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /v1/dashboard/inspector-performance/:inspectorId', () => {
  it('returns 400 VALIDATION_ERROR for a non-uuid id (before the use case)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-performance/not-a-uuid')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockDetailExecute).not.toHaveBeenCalled();
  });

  it('returns 404 INSPECTOR_NOT_FOUND for an unknown id', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDetailExecute.mockRejectedValueOnce(new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found'));
    const res = await supertest(app.server)
      .get(`/v1/dashboard/inspector-performance/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INSPECTOR_NOT_FOUND');
  });

  it('returns 403 for a CL actor', async () => {
    mockJwtVerify.mockResolvedValueOnce({ userId: 'u', tenantId: 't1', role: 'CL_ADMIN', branchId: null, inspectorId: null });
    mockDetailExecute.mockRejectedValueOnce(new ForbiddenError('FORBIDDEN', 'Role is not permitted'));
    const res = await supertest(app.server)
      .get(`/v1/dashboard/inspector-performance/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(403);
  });

  it('strips undeclared coordinate/PII keys and keeps all declared fields (privacy + schema contract)', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockDetailExecute.mockResolvedValueOnce(detailPayload());
    const res = await supertest(app.server)
      .get(`/v1/dashboard/inspector-performance/${INSPECTOR_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    // Schema contract: the full declared shape is present after serialization.
    expect(successResponseSchema(inspectorReliabilityResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data.metrics).toHaveLength(8);

    // Privacy contract: no coordinate/PII key survives anywhere in the body.
    const keys = new Set<string>();
    collectKeys(res.body, keys);
    for (const forbidden of ['latitude', 'longitude', 'lat', 'lng', 'email', 'phone']) {
      expect(keys.has(forbidden)).toBe(false);
    }
    // No metric exceeds the failure cap, every detail is short and location-free.
    const coordinate = /-?\d{1,3}\.\d{4,}/;
    for (const m of res.body.data.metrics) {
      expect(m.failures.length).toBeLessThanOrEqual(20);
      for (const f of m.failures) {
        expect(f.detail.length).toBeLessThanOrEqual(80);
        expect(coordinate.test(f.detail)).toBe(false);
        expect(f.detail).not.toContain(PROPERTY_ADDRESS);
      }
    }
  });
});
