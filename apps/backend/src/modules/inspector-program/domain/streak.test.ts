import { describe, expect, it } from 'vitest';
import { computeStreak, isStreakAtRisk, type StreakParticipation } from './streak';

// today is a Monday → current week starts 2026-11-23; closed weeks step back
// 2026-11-16, 2026-11-09, 2026-11-02, … ; current month Nov, last closed Oct (01).
const TODAY = '2026-11-23';
const week = (periodStart: string, awarded: boolean): StreakParticipation => ({
  goalPeriodType: 'WEEKLY',
  periodStart,
  awarded,
});

describe('computeStreak', () => {
  it('three awarded weeks in a row', () => {
    const result = computeStreak({
      today: TODAY,
      participations: [week('2026-11-16', true), week('2026-11-09', true), week('2026-11-02', true)],
    });
    expect(result).toEqual({ cycle: 'WEEKLY', count: 3 });
  });

  it('the most recent participated week without an award → 0', () => {
    expect(computeStreak({ today: TODAY, participations: [week('2026-11-16', false)] })).toEqual({
      cycle: 'WEEKLY',
      count: 0,
    });
  });

  it('a most recent week with no participation is skipped; earlier weeks count', () => {
    expect(
      computeStreak({ today: TODAY, participations: [week('2026-11-09', true), week('2026-11-02', true)] }),
    ).toEqual({ cycle: 'WEEKLY', count: 2 });
  });

  it('a hole (participated, no award) in the middle stops the count', () => {
    expect(
      computeStreak({
        today: TODAY,
        participations: [week('2026-11-16', true), week('2026-11-09', false), week('2026-11-02', true)],
      }),
    ).toEqual({ cycle: 'WEEKLY', count: 1 });
  });

  it('picks the smallest cycle; monthly awards do not count', () => {
    expect(
      computeStreak({
        today: TODAY,
        participations: [week('2026-11-16', true), { goalPeriodType: 'MONTHLY', periodStart: '2026-10-01', awarded: true }],
      }),
    ).toEqual({ cycle: 'WEEKLY', count: 1 });
  });

  it('monthly only', () => {
    const result = computeStreak({
      today: TODAY,
      participations: [{ goalPeriodType: 'MONTHLY', periodStart: '2026-10-01', awarded: true }],
    });
    expect(result.cycle).toBe('MONTHLY');
    expect(result.count).toBe(1);
  });

  it('no participation → null cycle, 0', () => {
    expect(computeStreak({ today: TODAY, participations: [] })).toEqual({ cycle: null, count: 0 });
  });
});

describe('isStreakAtRisk', () => {
  const base = {
    streak: 2,
    today: '2026-11-29',
    currentPeriodEnd: '2026-11-29',
    participatesInCycleGoal: true,
    achievedSoFar: false,
  };
  it('true when streak ≥ 1, last day, participating, nothing achieved', () => {
    expect(isStreakAtRisk(base)).toBe(true);
  });
  it('false if any condition fails', () => {
    expect(isStreakAtRisk({ ...base, streak: 0 })).toBe(false);
    expect(isStreakAtRisk({ ...base, today: '2026-11-28' })).toBe(false);
    expect(isStreakAtRisk({ ...base, participatesInCycleGoal: false })).toBe(false);
    expect(isStreakAtRisk({ ...base, achievedSoFar: true })).toBe(false);
  });
});
