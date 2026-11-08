import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import {
  goalResponseSchema,
  rewardAwardResponseSchema,
  programPeriodSummaryResponseSchema,
  programPeriodsResponseSchema,
  successResponseSchema,
  paginatedResponseSchema,
} from '@properfy/shared';
import { buildApp } from '../../../src/main/server';
import { createMockContainer } from '../../helpers/mock-container';
import { GoalNotFoundError } from '../../../src/modules/inspector-program/domain/inspector-program.errors';

const mockCreateGoal = vi.fn();
const mockUpdateGoal = vi.fn();
const mockListGoals = vi.fn();
const mockGetGoal = vi.fn();
const mockListPeriods = vi.fn();
const mockListAwards = vi.fn();
const mockSummary = vi.fn();
const mockApprove = vi.fn();
const mockVoid = vi.fn();
const mockJwtVerify = vi.fn();
const mockTenantFindById = vi.fn();

vi.mock('../../../src/main/container', () => ({
  createContainer: () =>
    createMockContainer({
      inspectorProgram: {
        createGoalUseCase: { execute: mockCreateGoal },
        updateGoalUseCase: { execute: mockUpdateGoal },
        listGoalsUseCase: { execute: mockListGoals },
        getGoalUseCase: { execute: mockGetGoal },
        listProgramPeriodsUseCase: { execute: mockListPeriods },
        listRewardAwardsUseCase: { execute: mockListAwards },
        getProgramPeriodSummaryUseCase: { execute: mockSummary },
        approveRewardAwardUseCase: { execute: mockApprove },
        voidRewardAwardUseCase: { execute: mockVoid },
        jwtService: { verify: mockJwtVerify },
        tenantRepo: { findById: mockTenantFindById },
      },
    }),
}));

const amContext = { userId: 'admin-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
const opContext = { userId: 'op-1', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
const GOAL_ID = '33333333-3333-4333-8333-333333333333';
const AWARD_ID = '55555555-5555-4555-8555-555555555555';

function goalPayload(extra: Record<string, unknown> = {}) {
  return {
    id: GOAL_ID,
    title: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    period: 'WEEKLY',
    scopeRegionId: null,
    scopeServiceTypeId: null,
    scopeInspectorId: null,
    scopeRegionName: null,
    scopeServiceTypeName: null,
    scopeInspectorName: null,
    rewardAmount: 30,
    startsAt: '2026-11-16',
    endsAt: null,
    active: true,
    deactivatedAt: null,
    pendingChange: null,
    resumesOn: null,
    minEndsAt: '2026-11-22',
    currentPeriod: null,
    lastClosedPeriod: null,
    scopeRegionDeleted: false,
    createdByUserId: '44444444-4444-4444-4444-444444444444',
    updatedByUserId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...extra,
  };
}

function awardPayload() {
  return {
    id: AWARD_ID,
    goalId: GOAL_ID,
    inspectorId: '66666666-6666-4666-8666-666666666666',
    periodType: 'WEEKLY',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    goalTitle: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    amount: 30,
    scopeLabel: null,
    achievedValue: 12,
    serviceCount: 12,
    achievedOn: '2026-11-06',
    indexScoreAtClose: 88.3,
    levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08',
    status: 'PENDING',
    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,
    paidAt: null,
    voidedByUserId: null,
    voidedByName: null,
    voidedAt: null,
    voidReason: null,
    inspectorNote: null,
    goal: { id: GOAL_ID, title: 'Weekly volume' },
    inspector: { id: '66666666-6666-4666-8666-666666666666', name: 'Ana', email: 'ana@example.com' },
    financialEntryId: null,
    invoice: null,
    voidedAfterInvoicing: false,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
  };
}

// The repo row shape listRewardAwardsUseCase returns (mapped by the route).
function awardWithRelations() {
  return {
    ...awardPayload(),
    approvedBy: null,
    voidedBy: null,
    approvedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-11-09T00:00:00.000Z'),
    updatedAt: new Date('2026-11-09T00:00:00.000Z'),
  };
}

function summaryPayload() {
  return {
    periodType: 'WEEKLY',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    status: 'CLOSED',
    totals: { promised: 90, achieved: 60, approved: 0, paid: 0, pending: 60, voided: 30 },
    goals: [
      {
        goalId: GOAL_ID,
        title: 'Weekly volume',
        metric: 'VOLUME',
        rewardAmount: 30,
        participants: 3,
        promised: 90,
        achievers: 2,
        achievedAmount: 60,
        closed: true,
        skipped: false,
      },
    ],
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
  mockTenantFindById.mockResolvedValue({ isActive: () => true, settingsJson: {} });
});

const AGENCY_ROLES = ['CL_ADMIN', 'CL_USER', 'INSP', 'TNT'] as const;

describe('GET /v1/inspector-program/goals', () => {
  it('returns 401 without a token', async () => {
    const res = await supertest(app.server).get('/v1/inspector-program/goals');
    expect(res.status).toBe(401);
    expect(mockListGoals).not.toHaveBeenCalled();
  });

  it.each([['AM', amContext], ['OP', opContext]] as const)('returns 200 for %s', async (_role, ctx) => {
    mockJwtVerify.mockResolvedValue(ctx);
    mockListGoals.mockResolvedValueOnce({ data: [goalPayload()], total: 1 });
    const res = await supertest(app.server).get('/v1/inspector-program/goals').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(paginatedResponseSchema(goalResponseSchema).safeParse(res.body).success).toBe(true);
  });

  it.each(AGENCY_ROLES)('returns 403 for %s before any read', async (role) => {
    mockJwtVerify.mockResolvedValue({ userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null });
    const res = await supertest(app.server).get('/v1/inspector-program/goals').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(403);
    expect(mockListGoals).not.toHaveBeenCalled();
  });
});

describe('POST /v1/inspector-program/goals', () => {
  const body = { title: 'Weekly volume', metric: 'VOLUME', period: 'WEEKLY', target: 10, rewardAmount: 30, startsAt: '2026-11-16' };

  it('creates a goal and strips undeclared keys (privacy contract)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockCreateGoal.mockResolvedValueOnce({ ...goalPayload(), latitude: -33.86, agencyName: 'Acme' });
    const res = await supertest(app.server).post('/v1/inspector-program/goals').set('Authorization', 'Bearer valid').send(body);
    expect(res.status).toBe(201);
    expect(successResponseSchema(goalResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data.latitude).toBeUndefined();
    expect(res.body.data.agencyName).toBeUndefined();
  });

  it('returns 400 for an invalid body', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .post('/v1/inspector-program/goals')
      .set('Authorization', 'Bearer valid')
      .send({ ...body, target: 2.5 });
    expect(res.status).toBe(400);
    expect(mockCreateGoal).not.toHaveBeenCalled();
  });

  it.each(AGENCY_ROLES)('returns 403 for %s', async (role) => {
    mockJwtVerify.mockResolvedValue({ userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null });
    const res = await supertest(app.server).post('/v1/inspector-program/goals').set('Authorization', 'Bearer valid').send(body);
    expect(res.status).toBe(403);
  });
});

describe('GET /v1/inspector-program/goals/:goalId', () => {
  it('returns 200 for AM', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockGetGoal.mockResolvedValueOnce(goalPayload());
    const res = await supertest(app.server).get(`/v1/inspector-program/goals/${GOAL_ID}`).set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(successResponseSchema(goalResponseSchema).safeParse(res.body).success).toBe(true);
  });

  it('returns 404 GOAL_NOT_FOUND for a missing goal', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockGetGoal.mockRejectedValueOnce(new GoalNotFoundError());
    const res = await supertest(app.server).get(`/v1/inspector-program/goals/${GOAL_ID}`).set('Authorization', 'Bearer valid');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GOAL_NOT_FOUND');
  });

  it('returns 400 for a non-uuid id', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server).get('/v1/inspector-program/goals/not-a-uuid').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(400);
    expect(mockGetGoal).not.toHaveBeenCalled();
  });
});

describe('PATCH /v1/inspector-program/goals/:goalId', () => {
  it('returns 200 for OP', async () => {
    mockJwtVerify.mockResolvedValue(opContext);
    mockUpdateGoal.mockResolvedValueOnce(goalPayload({ title: 'Renamed' }));
    const res = await supertest(app.server)
      .patch(`/v1/inspector-program/goals/${GOAL_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({ title: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed');
  });

  it('returns 400 for an immutable field', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .patch(`/v1/inspector-program/goals/${GOAL_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({ metric: 'PUNCTUALITY' });
    expect(res.status).toBe(400);
    expect(mockUpdateGoal).not.toHaveBeenCalled();
  });
});

describe('GET /v1/inspector-program/periods', () => {
  it('returns 200 and the period list', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockListPeriods.mockResolvedValueOnce({ data: [{ start: '2026-11-09', end: '2026-11-15', status: 'IN_PROGRESS' }] });
    const res = await supertest(app.server)
      .get('/v1/inspector-program/periods?periodType=WEEKLY&direction=upcoming&count=3')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(programPeriodsResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('returns 400 when direction is missing', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .get('/v1/inspector-program/periods?periodType=WEEKLY&count=3')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/inspector-program/awards', () => {
  it('returns 200 and maps the awards', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockListAwards.mockResolvedValueOnce({ data: [awardWithRelations()], total: 1 });
    const res = await supertest(app.server).get('/v1/inspector-program/awards').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(paginatedResponseSchema(rewardAwardResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data[0].id).toBe(AWARD_ID);
  });

  it.each(AGENCY_ROLES)('returns 403 for %s', async (role) => {
    mockJwtVerify.mockResolvedValue({ userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null });
    const res = await supertest(app.server).get('/v1/inspector-program/awards').set('Authorization', 'Bearer valid');
    expect(res.status).toBe(403);
  });
});

describe('GET /v1/inspector-program/summary', () => {
  it('returns 200 and the period summary', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockSummary.mockResolvedValueOnce(summaryPayload());
    const res = await supertest(app.server)
      .get('/v1/inspector-program/summary?periodType=WEEKLY&periodStart=2026-11-02')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(successResponseSchema(programPeriodSummaryResponseSchema).safeParse(res.body).success).toBe(true);
  });
});

describe('POST /v1/inspector-program/awards/:awardId/approve', () => {
  it('approves with an Idempotency-Key', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockApprove.mockResolvedValueOnce({ ...awardPayload(), status: 'APPROVED' });
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/approve`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'key-1');
    expect(res.status).toBe(200);
    expect(successResponseSchema(rewardAwardResponseSchema).safeParse(res.body).success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('returns 400 IDEMPOTENCY_KEY_REQUIRED without the header', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/approve`)
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it.each(AGENCY_ROLES)('returns 403 for %s', async (role) => {
    mockJwtVerify.mockResolvedValue({ userId: 'u', tenantId: role.startsWith('CL') ? 't1' : null, role, branchId: null, inspectorId: null });
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/approve`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'key-1');
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/inspector-program/awards/:awardId/void', () => {
  it('voids with a reason and inspector note', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    mockVoid.mockResolvedValueOnce({ ...awardPayload(), status: 'VOID', voidReason: 'Agency rejected the job' });
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/void`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'key-1')
      .send({ reason: 'Agency rejected the job', inspectorNote: 'Sorry' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VOID');
  });

  it('rejects a recoveryNote field (Q12, 400)', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/void`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'key-1')
      .send({ reason: 'Agency rejected the job', recoveryNote: 'reverse it' });
    expect(res.status).toBe(400);
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it('rejects a reason shorter than 5 characters', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/void`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'key-1')
      .send({ reason: 'no' });
    expect(res.status).toBe(400);
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it('returns 400 IDEMPOTENCY_KEY_REQUIRED without the header', async () => {
    mockJwtVerify.mockResolvedValue(amContext);
    const res = await supertest(app.server)
      .post(`/v1/inspector-program/awards/${AWARD_ID}/void`)
      .set('Authorization', 'Bearer valid')
      .send({ reason: 'Agency rejected the job' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});
