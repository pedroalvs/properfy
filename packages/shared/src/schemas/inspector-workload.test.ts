import { describe, expect, it } from 'vitest';
import {
  inspectorWorkloadQuerySchema,
  inspectorWorkloadResponseSchema,
} from './inspector-workload';

describe('inspectorWorkloadQuerySchema', () => {
  it('accepts a Monday', () => {
    // 2026-07-27 is a Monday.
    expect(inspectorWorkloadQuerySchema.parse({ weekStart: '2026-07-27' })).toEqual({
      weekStart: '2026-07-27',
    });
  });

  it('accepts an absent weekStart so the server can resolve the current week', () => {
    expect(inspectorWorkloadQuerySchema.parse({})).toEqual({});
  });

  it.each([
    ['a Tuesday', '2026-07-28'],
    ['a Sunday', '2026-08-02'],
    ['a Saturday', '2026-08-01'],
  ])('rejects %s', (_label, weekStart) => {
    const result = inspectorWorkloadQuerySchema.safeParse({ weekStart });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toEqual(['weekStart']);
      expect(result.error.errors[0]?.message).toBe('weekStart must be a Monday');
    }
  });

  it('rejects an impossible calendar date before the Monday check', () => {
    expect(inspectorWorkloadQuerySchema.safeParse({ weekStart: '2026-02-31' }).success).toBe(false);
  });
});

function validResponse() {
  return {
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
      totalInWeek: 21,
      activeInspectorCount: 2,
      avgPerInspector: 10.5,
      nearLimit: {
        count: 1,
        inspectors: [
          {
            inspectorId: '11111111-1111-4111-8111-111111111111',
            inspectorName: 'Sarah Chen',
            total: 16,
          },
        ],
      },
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
        scheduled: 21,
        confirmed: 18,
        confirmationEligible: 20,
      },
      next: {
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        done: 0,
        scheduled: 14,
        confirmed: 9,
        confirmationEligible: 14,
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
          inspectorId: '11111111-1111-4111-8111-111111111111',
          inspectorName: 'Sarah Chen',
          isActive: true,
          days: [3, 3, 3, 3, 2, 1, 1],
          total: 16,
          level: 'busy' as const,
        },
        {
          inspectorId: '22222222-2222-4222-8222-222222222222',
          inspectorName: 'Tom Baker',
          isActive: true,
          days: [1, 1, 1, 1, 1, 0, 0],
          total: 5,
          level: 'normal' as const,
        },
      ],
      teamTotalsByDay: [4, 4, 4, 4, 3, 1, 1],
      teamTotal: 21,
    },
  };
}

describe('inspectorWorkloadResponseSchema', () => {
  it('accepts a full payload', () => {
    expect(inspectorWorkloadResponseSchema.safeParse(validResponse()).success).toBe(true);
  });

  it('accepts a null avgPerInspector for an empty roster', () => {
    const payload = validResponse();
    payload.kpis.avgPerInspector = null as unknown as number;
    expect(inspectorWorkloadResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a day tuple that is not seven long', () => {
    const payload = validResponse();
    payload.matrix.inspectors[0]!.days = [1, 2, 3];
    expect(inspectorWorkloadResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a week that does not list seven days', () => {
    const payload = validResponse();
    payload.week.days = payload.week.days.slice(0, 5);
    expect(inspectorWorkloadResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects negative counts', () => {
    const payload = validResponse();
    payload.matrix.teamTotal = -1;
    expect(inspectorWorkloadResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an unknown workload level', () => {
    const payload = validResponse();
    payload.matrix.inspectors[0]!.level = 'critical' as never;
    expect(inspectorWorkloadResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a month label that is not YYYY-MM', () => {
    const payload = validResponse();
    payload.completed.selectedMonth = '2026-7';
    expect(inspectorWorkloadResponseSchema.safeParse(payload).success).toBe(false);
  });
});
