import { describe, expect, it } from 'vitest';
import { INSPECTOR_NOTICE_BODY_MAX, INSPECTOR_NOTICE_TITLE_MAX } from '@properfy/shared';
import {
  buildGoalReachedMessage,
  buildLevelChangeMessage,
  buildStreakRiskMessage,
} from './program-message-copy';

const THRESHOLDS = { silverMinScore: 60, goldMinScore: 85 };

describe('buildGoalReachedMessage', () => {
  it('builds the single-goal copy with the period text and a two-decimal amount', () => {
    const msg = buildGoalReachedMessage([
      { goalTitle: 'Weekly volume', amount: 30, periodType: 'WEEKLY', periodStart: '2026-11-02' },
    ]);
    expect(msg.title).toBe('Goal reached: Weekly volume');
    expect(msg.body).toBe(
      'You reached "Weekly volume" for the week of Mon 2 Nov. Your $30.00 bonus will be reviewed and, once approved, added to your next invoice.',
    );
  });

  it('uses the fortnight period text', () => {
    const msg = buildGoalReachedMessage([
      { goalTitle: 'Fortnight volume', amount: 40, periodType: 'FORTNIGHTLY', periodStart: '2026-11-02' },
    ]);
    expect(msg.body).toContain('for the fortnight of Mon 2 Nov.');
  });

  it('uses the month period text (name only, no year)', () => {
    const msg = buildGoalReachedMessage([
      { goalTitle: 'Monthly volume', amount: 40, periodType: 'MONTHLY', periodStart: '2026-11-01' },
    ]);
    expect(msg.body).toContain('for November.');
  });

  it('aggregates multiple goals with a summed total (titles in given order)', () => {
    const msg = buildGoalReachedMessage([
      { goalTitle: 'Weekly volume', amount: 30, periodType: 'WEEKLY', periodStart: '2026-11-09' },
      { goalTitle: 'On-time arrival', amount: 30, periodType: 'WEEKLY', periodStart: '2026-11-09' },
      { goalTitle: 'Region volume', amount: 60, periodType: 'WEEKLY', periodStart: '2026-11-09' },
      { goalTitle: 'Fortnight volume', amount: 40, periodType: 'FORTNIGHTLY', periodStart: '2026-11-02' },
    ]);
    expect(msg.title).toBe('You reached 4 goals');
    expect(msg.body).toBe(
      'You reached "Weekly volume", "On-time arrival", "Region volume" and "Fortnight volume". Your bonuses (total $160.00) will be reviewed and, once approved, added to your next invoice.',
    );
  });

  it('joins exactly two goals with "and"', () => {
    const msg = buildGoalReachedMessage([
      { goalTitle: 'A', amount: 10, periodType: 'WEEKLY', periodStart: '2026-11-09' },
      { goalTitle: 'B', amount: 20, periodType: 'WEEKLY', periodStart: '2026-11-09' },
    ]);
    expect(msg.body).toContain('You reached "A" and "B".');
  });

  it('truncates an over-long title to the limit with an ellipsis', () => {
    const longTitle = 'x'.repeat(118); // "Goal reached: " + 118 = 132 > 120
    const msg = buildGoalReachedMessage([
      { goalTitle: longTitle, amount: 30, periodType: 'WEEKLY', periodStart: '2026-11-02' },
    ]);
    expect(msg.title.length).toBe(INSPECTOR_NOTICE_TITLE_MAX);
    expect(msg.title.endsWith('…')).toBe(true);
  });

  it('truncates an over-long aggregated body to the limit with an ellipsis', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      goalTitle: `Goal number ${i} with a fairly long descriptive title`,
      amount: 10,
      periodType: 'WEEKLY' as const,
      periodStart: '2026-11-09',
    }));
    const msg = buildGoalReachedMessage(many);
    expect(msg.body.length).toBeLessThanOrEqual(INSPECTOR_NOTICE_BODY_MAX);
    expect(msg.body.endsWith('…')).toBe(true);
  });
});

describe('buildLevelChangeMessage', () => {
  it('builds the level-up copy', () => {
    const msg = buildLevelChangeMessage({ newLevel: 'GOLD', prevLevel: 'SILVER', score: 86, thresholds: THRESHOLDS });
    expect(msg.title).toBe("You're now Gold");
    expect(msg.body).toBe('Your reliability index is 86.0. Keep it up to stay at Gold.');
  });

  it('builds the level-down copy with the threshold to regain the previous level', () => {
    const msg = buildLevelChangeMessage({ newLevel: 'SILVER', prevLevel: 'GOLD', score: 83, thresholds: THRESHOLDS });
    expect(msg.title).toBe("You're now Silver");
    expect(msg.body).toBe('Your reliability index is 83.0. Reach 85.0 to get back to Gold.');
  });

  it('builds the drop-to-bronze copy pointing at the silver threshold', () => {
    const msg = buildLevelChangeMessage({ newLevel: 'BRONZE', prevLevel: 'SILVER', score: 55, thresholds: THRESHOLDS });
    expect(msg.body).toBe('Your reliability index is 55.0. Reach 60.0 to get back to Silver.');
  });
});

describe('buildStreakRiskMessage', () => {
  it('builds the weekly streak-risk copy', () => {
    const msg = buildStreakRiskMessage({ cycle: 'WEEKLY', count: 3 });
    expect(msg.title).toBe('Your 3-week streak is at risk');
    expect(msg.body).toBe('Today is the last day of the week. Reach any weekly goal to keep your streak going.');
  });

  it('builds the fortnightly streak-risk copy', () => {
    const msg = buildStreakRiskMessage({ cycle: 'FORTNIGHTLY', count: 2 });
    expect(msg.title).toBe('Your 2-fortnight streak is at risk');
    expect(msg.body).toContain('last day of the fortnight. Reach any fortnightly goal');
  });

  it('builds the monthly streak-risk copy', () => {
    const msg = buildStreakRiskMessage({ cycle: 'MONTHLY', count: 1 });
    expect(msg.title).toBe('Your 1-month streak is at risk');
    expect(msg.body).toContain('last day of the month. Reach any monthly goal');
  });
});
