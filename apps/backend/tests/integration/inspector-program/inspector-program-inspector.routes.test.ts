import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { inspectorProgramResponseSchema, successResponseSchema } from '@properfy/shared';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { GetInspectorProgramUseCase } from '../../../src/modules/inspector-program/application/use-cases/get-inspector-program.use-case';
import type { CurrentIndex } from '../../../src/modules/reliability/application/reliability-index.reader';
import type { RewardAward } from '../../../src/modules/inspector-program/domain/reward-award.entity';
import type { GoalProgress, InspectorStanding } from '../../../src/modules/inspector-program/application/inspector-program-standing.service';

const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

const ME = 'aaaaaaaa-1111-4111-8111-111111111111';
// Five other inspectors with ids that must never surface in the response body.
const OTHER_IDS = ['bbbbbbbb-2222', 'cccccccc-3333', 'dddddddd-4444', 'eeeeeeee-5555', 'ffffffff-6666'];

// Mutable fakes the real use case reads, set per test.
let fakeIndexes: CurrentIndex[] = [];
let fakeAwards: RewardAward[] = [];
let fakeStanding: InspectorStanding;
let fakeProgress: GoalProgress[] = [];

const realUseCase = new GetInspectorProgramUseCase(
  {
    getStanding: async () => fakeStanding,
    getActiveGoalProgress: async () => fakeProgress,
  },
  { getCurrentIndexes: async () => fakeIndexes },
  {
    findRecentByInspector: async () => fakeAwards,
    findRecentNonVoidByCreatedAt: async () => [],
  },
  {
    get: (async () => ({
      levels: { silverMinScore: 60, goldMinScore: 85 },
      earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null },
    })) as never,
  },
  { now: () => new Date('2026-11-08T21:00:00.000Z') },
);

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      inspectorProgram: {
        // Wrap the real use case in a plain object so the mock-container deep-merge
        // overrides `execute` (a class instance's method lives on the prototype, which
        // the merge would skip, leaving the default stub in place).
        getInspectorProgramUseCase: { execute: (input: { inspectorId: string }) => realUseCase.execute(input) },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

function current(inspectorId: string, position: number | null, score: number | null): CurrentIndex {
  return {
    inspectorId,
    score,
    status: score === null ? 'INSUFFICIENT_VOLUME' : 'SCORED',
    position,
    volume: 15,
    snapshotDate: '2026-11-08',
  };
}

function callerAward(overrides: Partial<RewardAward> = {}): RewardAward {
  return {
    id: 'award-1', goalId: 'goal-1', inspectorId: ME, periodType: 'WEEKLY',
    periodStart: '2026-11-02', periodEnd: '2026-11-08', goalTitle: 'Weekly volume',
    metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
    achievedValue: 12, serviceCount: 12, achievedOn: '2026-11-06', indexScoreAtClose: 90,
    levelAtClose: 'GOLD', indexSnapshotDate: '2026-11-08', status: 'PENDING',
    approvedByUserId: null, approvedAt: null, paidAt: null, voidedByUserId: null,
    voidedAt: null, voidReason: null, inspectorNote: null, inspectorInvoiceId: null,
    createdAt: new Date('2026-11-08T04:45:00.000Z'), updatedAt: new Date('2026-11-08T04:45:00.000Z'),
    ...overrides,
  };
}

/** Recursively collects every object key in a JSON value. */
function allKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, acc));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      allKeys(v, acc);
    }
  }
  return acc;
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
  fakeStanding = {
    inspectorId: ME,
    index: { score: 90, status: 'SCORED', snapshotDate: '2026-11-08', position: 3 },
    level: 'GOLD',
    streak: { cycle: 'WEEKLY', count: 2, atRisk: false },
  };
  fakeProgress = [];
  fakeAwards = [callerAward()];
  // Caller + five other scored inspectors → cohort of 6.
  fakeIndexes = [
    current(ME, 3, 90),
    current(OTHER_IDS[0]!, 1, 98),
    current(OTHER_IDS[1]!, 2, 95),
    current(OTHER_IDS[2]!, 4, 88),
    current(OTHER_IDS[3]!, 5, 80),
    current(OTHER_IDS[4]!, 6, 70),
  ];
});

const insp = (inspectorId: string | null) => ({ userId: 'u', tenantId: null, role: 'INSP', branchId: null, inspectorId });

describe('GET /v1/inspector/program (03.A3 anonymity + RBAC)', () => {
  it('returns 200 with a schema-valid body for a linked inspector', async () => {
    mockJwtVerify.mockResolvedValue(insp(ME));
    const res = await supertest(app.server).get('/v1/inspector/program').set('Authorization', 'Bearer v');
    expect(res.status).toBe(200);
    expect(successResponseSchema(inspectorProgramResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data.ranking.myPosition).toBe(3);
    expect(res.body.data.ranking.totalRanked).toBe(6);
  });

  it('never leaks another inspector id, name, email or phone (03.A3)', async () => {
    mockJwtVerify.mockResolvedValue(insp(ME));
    fakeAwards = [callerAward({ status: 'VOID', voidedAt: new Date('2026-11-10T00:00:00.000Z'), voidReason: 'SECRET-INTERNAL-REASON', inspectorNote: 'Cancelled by agency.' })];
    const res = await supertest(app.server).get('/v1/inspector/program').set('Authorization', 'Bearer v');
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    for (const id of OTHER_IDS) expect(serialized).not.toContain(id);
    expect(serialized).not.toContain('SECRET-INTERNAL-REASON');
    const keys = allKeys(res.body.data);
    for (const forbidden of ['inspectorId', 'id', 'name', 'photoUrl', 'avatarUrl', 'email', 'phone', 'voidReason']) {
      expect(keys.has(forbidden)).toBe(false);
    }
    for (const entry of res.body.data.ranking.entries) {
      expect(Object.keys(entry).sort()).toEqual(['isMe', 'level', 'position', 'score']);
    }
  });

  it('returns an empty entries list when fewer than 5 are ranked', async () => {
    mockJwtVerify.mockResolvedValue(insp(ME));
    fakeIndexes = [current(ME, 1, 90), current(OTHER_IDS[0]!, 2, 80), current(OTHER_IDS[1]!, 3, 70), current(OTHER_IDS[2]!, 4, 60)];
    const res = await supertest(app.server).get('/v1/inspector/program').set('Authorization', 'Bearer v');
    expect(res.status).toBe(200);
    expect(res.body.data.ranking.cohortTooSmall).toBe(true);
    expect(res.body.data.ranking.entries).toEqual([]);
    expect(res.body.data.ranking.myPosition).toBe(1);
  });

  it('returns 401 without a token', async () => {
    const res = await supertest(app.server).get('/v1/inspector/program');
    expect(res.status).toBe(401);
  });

  it.each(['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'TNT'] as const)('returns 403 for %s', async (role) => {
    mockJwtVerify.mockResolvedValue({ userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null });
    const res = await supertest(app.server).get('/v1/inspector/program').set('Authorization', 'Bearer v');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 INSPECTOR_NOT_LINKED for an INSP without an inspector', async () => {
    mockJwtVerify.mockResolvedValue(insp(null));
    const res = await supertest(app.server).get('/v1/inspector/program').set('Authorization', 'Bearer v');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSPECTOR_NOT_LINKED');
  });
});
