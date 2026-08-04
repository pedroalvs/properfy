import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { inspectorWorkloadResponseSchema, successResponseSchema } from '@properfy/shared';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const mockWorkloadExecute = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      dashboard: {
        getInspectorWorkloadUseCase: { execute: mockWorkloadExecute },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };

const ALICE = '11111111-1111-4111-8111-111111111111';

const workloadPayload = {
  week: {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ],
  },
  thresholds: { weeklyBusy: 15, weeklyOverloaded: 18, dailyBusy: 3, dailyOverloaded: 4 },
  kpis: {
    totalInWeek: 16,
    activeInspectorCount: 1,
    avgPerInspector: 16,
    nearLimit: { count: 1, inspectors: [{ inspectorId: ALICE, inspectorName: 'Alice', total: 16 }] },
    overloaded: { count: 0, inspectors: [] },
  },
  funnel: {
    previous: {
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26',
      done: 12,
      scheduled: 12,
      confirmed: 11,
      confirmationEligible: 12,
    },
    selected: {
      weekStart: '2026-07-27',
      weekEnd: '2026-08-02',
      done: 4,
      scheduled: 16,
      confirmed: 14,
      confirmationEligible: 16,
    },
    next: {
      weekStart: '2026-08-03',
      weekEnd: '2026-08-09',
      done: 0,
      scheduled: 9,
      confirmed: 6,
      confirmationEligible: 9,
    },
  },
  completed: {
    doneSelectedWeek: 4,
    donePreviousWeek: 12,
    doneSelectedMonth: 40,
    donePreviousMonth: 38,
    selectedMonth: '2026-07',
    previousMonth: '2026-06',
  },
  matrix: {
    inspectors: [
      {
        inspectorId: ALICE,
        inspectorName: 'Alice',
        isActive: true,
        days: [3, 3, 3, 3, 2, 1, 1],
        total: 16,
        level: 'busy',
      },
    ],
    teamTotalsByDay: [3, 3, 3, 3, 2, 1, 1],
    teamTotal: 16,
  },
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
  mockTenantFindById.mockResolvedValue({ isActive: () => true, settingsJson: {} });
});

describe('GET /v1/dashboard/inspector-workload', () => {
  it.each([
    ['AM', amContext],
    ['OP', opContext],
  ])('returns 200 for %s and the payload round-trips through the response schema', async (_role, context) => {
    mockJwtVerify.mockResolvedValueOnce(context);
    mockWorkloadExecute.mockResolvedValueOnce(workloadPayload);

    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-workload')
      .query({ weekStart: '2026-07-27' })
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(successResponseSchema(inspectorWorkloadResponseSchema).safeParse(res.body).success).toBe(
      true,
    );
    // A field the response schema does not declare is stripped in silence, so
    // assert the whole payload rather than a couple of spot values.
    expect(res.body.data).toEqual(workloadPayload);
  });

  it('passes the auth context and the parsed week to the use case', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockWorkloadExecute.mockResolvedValueOnce(workloadPayload);

    await supertest(app.server)
      .get('/v1/dashboard/inspector-workload')
      .query({ weekStart: '2026-07-27' })
      .set('Authorization', 'Bearer valid-token');

    expect(mockWorkloadExecute).toHaveBeenCalledWith({
      actor: amContext,
      query: { weekStart: '2026-07-27' },
    });
  });

  it('accepts an omitted weekStart so the server resolves the current week', async () => {
    mockJwtVerify.mockResolvedValueOnce(amContext);
    mockWorkloadExecute.mockResolvedValueOnce(workloadPayload);

    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-workload')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockWorkloadExecute).toHaveBeenCalledWith({ actor: amContext, query: {} });
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'])('maps the use case denial for %s onto a 403', async (role) => {
    mockJwtVerify.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: '22222222-2222-4222-8222-222222222222',
      role,
      branchId: null,
      inspectorId: null,
    });
    mockWorkloadExecute.mockRejectedValueOnce(
      new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view inspector workload'),
    );

    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-workload')
      .query({ weekStart: '2026-07-27' })
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('returns 401 without an auth token', async () => {
    const res = await supertest(app.server).get('/v1/dashboard/inspector-workload');
    expect(res.status).toBe(401);
  });

  it('rejects a weekStart that is not a Monday without reaching the use case', async () => {
    mockJwtVerify.mockResolvedValue(amContext);

    // 2026-07-28 is a Tuesday.
    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-workload')
      .query({ weekStart: '2026-07-28' })
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(mockWorkloadExecute).not.toHaveBeenCalled();
  });

  it('rejects a malformed date without reaching the use case', async () => {
    mockJwtVerify.mockResolvedValue(amContext);

    const res = await supertest(app.server)
      .get('/v1/dashboard/inspector-workload')
      .query({ weekStart: '27/07/2026' })
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(mockWorkloadExecute).not.toHaveBeenCalled();
  });
});
