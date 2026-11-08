import { describe, it, expect } from 'vitest';
import type { ZodIssue } from 'zod';
import {
  createGoalSchema,
  updateGoalSchema,
  voidAwardSchema,
  programPeriodsQuerySchema,
  listGoalsQuerySchema,
  listAwardsQuerySchema,
  programPeriodSummaryQuerySchema,
  goalResponseSchema,
  rewardAwardResponseSchema,
} from './inspector-program';

/** The first issue whose path ends with `field`, or undefined. */
function issueFor(issues: ZodIssue[], field: string): ZodIssue | undefined {
  return issues.find((i) => i.path[i.path.length - 1] === field);
}

const validCreate = {
  title: 'Weekly volume',
  metric: 'VOLUME' as const,
  target: 60,
  period: 'WEEKLY' as const,
  rewardAmount: 60.0,
  startsAt: '2026-11-02',
};

describe('createGoalSchema', () => {
  it('accepts a minimal valid goal and defaults the comparator to GTE', () => {
    const result = createGoalSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comparator).toBe('GTE');
    }
  });

  it('defaults CANT_DO_MAX to the LTE comparator', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'CANT_DO_MAX', target: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comparator).toBe('LTE');
    }
  });

  it.each(['', 'x'.repeat(121)])('rejects an invalid title (%s length)', (title) => {
    const result = createGoalSchema.safeParse({ ...validCreate, title });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'title')).toBeDefined();
  });

  it("rejects CANT_DO_MAX with GTE (This metric uses 'at most')", () => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'CANT_DO_MAX', target: 5, comparator: 'GTE' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = issueFor(result.error.issues, 'comparator');
      expect(issue?.message).toBe("This metric uses 'at most'");
    }
  });

  it('requires a region for REGION_VOLUME', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'REGION_VOLUME' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = issueFor(result.error.issues, 'scopeRegionId');
      expect(issue?.message).toBe('Choose a region');
    }
  });

  it('requires a service type for SERVICE_TYPE_VOLUME', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'SERVICE_TYPE_VOLUME' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = issueFor(result.error.issues, 'scopeServiceTypeId');
      expect(issue?.message).toBe('Choose a service type');
    }
  });

  it('rejects a region on a non-region-volume metric', () => {
    const result = createGoalSchema.safeParse({
      ...validCreate,
      metric: 'PUNCTUALITY',
      target: 90,
      scopeRegionId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = issueFor(result.error.issues, 'scopeRegionId');
      expect(issue?.message).toBe('Region applies only to region volume goals');
    }
  });

  it('accepts an optional inspector scope on any metric', () => {
    const result = createGoalSchema.safeParse({
      ...validCreate,
      scopeInspectorId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it.each([0, 2.5, 10001])('rejects an invalid volume target (%s)', (target) => {
    const result = createGoalSchema.safeParse({ ...validCreate, target });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'target')).toBeDefined();
  });

  it.each([0, 101, 50.555])('rejects an invalid rate target (%s)', (target) => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'PUNCTUALITY', target });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'target')).toBeDefined();
  });

  it.each([90, 85.5])('accepts a valid rate target (%s)', (target) => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'PUNCTUALITY', target });
    expect(result.success).toBe(true);
  });

  it('rejects an INDEX_AT_LEAST target with two decimals', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'INDEX_AT_LEAST', target: 100.5 + 0.05 });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'target')).toBeDefined();
  });

  it('accepts an INDEX_AT_LEAST target with one decimal', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, metric: 'INDEX_AT_LEAST', target: 85.5 });
    expect(result.success).toBe(true);
  });

  it.each([undefined, 0, 100000, 30.005])('rejects an invalid rewardAmount (%s)', (rewardAmount) => {
    const result = createGoalSchema.safeParse({ ...validCreate, rewardAmount });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'rewardAmount')).toBeDefined();
  });

  it('rejects endsAt before startsAt', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, endsAt: '2026-10-26' });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'endsAt')).toBeDefined();
  });

  it('accepts a valid endsAt on or after startsAt', () => {
    const result = createGoalSchema.safeParse({ ...validCreate, endsAt: '2026-11-08' });
    expect(result.success).toBe(true);
  });
});

describe('updateGoalSchema', () => {
  it('accepts a partial update of allowed fields', () => {
    const result = updateGoalSchema.safeParse({ target: 12, rewardAmount: 40 });
    expect(result.success).toBe(true);
  });

  it.each(['metric', 'period', 'scopeRegionId', 'scopeServiceTypeId', 'scopeInspectorId', 'startsAt'])(
    'rejects the immutable field %s',
    (field) => {
      const result = updateGoalSchema.safeParse({ title: 'x', [field]: 'anything' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message === "This field can't be changed. Create a new goal instead.")).toBe(
          true,
        );
      }
    },
  );

  it('rejects an empty update', () => {
    const result = updateGoalSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Nothing to update')).toBe(true);
    }
  });

  it('accepts clearing endsAt with null', () => {
    const result = updateGoalSchema.safeParse({ endsAt: null });
    expect(result.success).toBe(true);
  });
});

describe('voidAwardSchema', () => {
  it('accepts a reason without an inspector note', () => {
    const result = voidAwardSchema.safeParse({ reason: 'Agency rejected the job' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inspectorNote).toBeUndefined();
  });

  it('accepts a reason with an inspector note', () => {
    const result = voidAwardSchema.safeParse({ reason: 'Agency rejected the job', inspectorNote: 'Sorry about that' });
    expect(result.success).toBe(true);
  });

  it('rejects an inspector note over 200 characters', () => {
    const result = voidAwardSchema.safeParse({ reason: 'Agency rejected the job', inspectorNote: 'x'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueFor(result.error.issues, 'inspectorNote')).toBeDefined();
  });

  it('rejects a recoveryNote field (Q12 — no manual payment)', () => {
    const result = voidAwardSchema.safeParse({ reason: 'Agency rejected the job', recoveryNote: 'reverse it' });
    expect(result.success).toBe(false);
  });
});

describe('programPeriodsQuerySchema', () => {
  it('accepts a valid query', () => {
    const result = programPeriodsQuerySchema.safeParse({ periodType: 'WEEKLY', direction: 'upcoming', count: 3 });
    expect(result.success).toBe(true);
  });

  it('requires direction and rejects an unknown `from` field', () => {
    const result = programPeriodsQuerySchema.safeParse({ periodType: 'FORTNIGHTLY', from: 'current', count: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects a count above 26', () => {
    const result = programPeriodsQuerySchema.safeParse({ periodType: 'WEEKLY', direction: 'past', count: 27 });
    expect(result.success).toBe(false);
  });
});

describe('list query schemas', () => {
  it('listGoalsQuerySchema defaults active=true and paginates', () => {
    const result = listGoalsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('listGoalsQuerySchema coerces active=false from the query string', () => {
    const result = listGoalsQuerySchema.safeParse({ active: 'false' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.active).toBe(false);
  });

  it('listAwardsQuerySchema caps pageSize at 100', () => {
    const result = listAwardsQuerySchema.safeParse({ pageSize: 500 });
    expect(result.success).toBe(false);
  });

  it('programPeriodSummaryQuerySchema requires periodType and periodStart', () => {
    expect(programPeriodSummaryQuerySchema.safeParse({ periodType: 'WEEKLY' }).success).toBe(false);
    expect(
      programPeriodSummaryQuerySchema.safeParse({ periodType: 'WEEKLY', periodStart: '2026-11-02' }).success,
    ).toBe(true);
  });
});

describe('response schemas', () => {
  it('goalResponseSchema parses a full goal response', () => {
    const result = goalResponseSchema.safeParse({
      id: '33333333-3333-3333-3333-333333333333',
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
      startsAt: '2026-11-02',
      endsAt: null,
      active: true,
      deactivatedAt: null,
      pendingChange: null,
      resumesOn: null,
      minEndsAt: '2026-11-08',
      currentPeriod: { start: '2026-11-02', end: '2026-11-08' },
      lastClosedPeriod: null,
      scopeRegionDeleted: false,
      createdByUserId: '44444444-4444-4444-4444-444444444444',
      updatedByUserId: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rewardAwardResponseSchema parses a full award response', () => {
    const result = rewardAwardResponseSchema.safeParse({
      id: '55555555-5555-5555-5555-555555555555',
      goalId: '33333333-3333-3333-3333-333333333333',
      inspectorId: '66666666-6666-6666-6666-666666666666',
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
      goal: { id: '33333333-3333-3333-3333-333333333333', title: 'Weekly volume' },
      inspector: { id: '66666666-6666-6666-6666-666666666666', name: 'Ana', email: 'ana@example.com' },
      financialEntryId: null,
      invoice: null,
      voidedAfterInvoicing: false,
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rewardAwardResponseSchema parses a paid award with its invoice (Q12)', () => {
    const result = rewardAwardResponseSchema.safeParse({
      id: '55555555-5555-5555-5555-555555555555',
      goalId: '33333333-3333-3333-3333-333333333333',
      inspectorId: '66666666-6666-6666-6666-666666666666',
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
      status: 'PAID',
      approvedByUserId: '77777777-7777-7777-7777-777777777777',
      approvedByName: 'Olga Operator',
      approvedAt: '2026-11-10T01:00:00.000Z',
      paidAt: '2026-11-20T02:00:00.000Z',
      voidedByUserId: null,
      voidedByName: null,
      voidedAt: null,
      voidReason: null,
      inspectorNote: null,
      goal: { id: '33333333-3333-3333-3333-333333333333', title: 'Weekly volume' },
      inspector: { id: '66666666-6666-6666-6666-666666666666', name: 'Ana', email: 'ana@example.com' },
      financialEntryId: '88888888-8888-8888-8888-888888888888',
      invoice: { id: '99999999-9999-9999-9999-999999999999', invoiceNumberDisplay: 'PINV-000042', status: 'PAID' },
      voidedAfterInvoicing: false,
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-20T02:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
