import {
  INSPECTOR_LEVEL_LABELS,
  INSPECTOR_NOTICE_BODY_MAX,
  INSPECTOR_NOTICE_TITLE_MAX,
  minScoreForLevel,
  type BillingPeriodType,
  type InspectorLevel,
} from '@properfy/shared';
import type { CivilDate } from './goal.entity';
import { civilMonthLong, shortCivilDate } from './bonus-description';

export interface ProgramMessage {
  title: string;
  body: string;
}

/** Period text used inside a message body: `the week of Mon 2 Nov` / `November`. */
function messagePeriodText(periodType: BillingPeriodType, periodStart: CivilDate): string {
  switch (periodType) {
    case 'WEEKLY':
      return `the week of ${shortCivilDate(periodStart)}`;
    case 'FORTNIGHTLY':
      return `the fortnight of ${shortCivilDate(periodStart)}`;
    case 'MONTHLY':
      return civilMonthLong(periodStart);
  }
}

/** Truncate to `max` characters, ending with a single-character ellipsis when cut. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

const CYCLE_NOUN: Record<BillingPeriodType, string> = {
  WEEKLY: 'week',
  FORTNIGHTLY: 'fortnight',
  MONTHLY: 'month',
};
const CYCLE_ADJ: Record<BillingPeriodType, string> = {
  WEEKLY: 'weekly',
  FORTNIGHTLY: 'fortnightly',
  MONTHLY: 'monthly',
};

export interface GoalReachedAwardInput {
  goalTitle: string;
  amount: number;
  periodType: BillingPeriodType;
  periodStart: CivilDate;
}

/**
 * The "goal reached" message for one inspector and one period end (L-F08-01/14).
 * One award → named copy with the period; several → an aggregated count + the
 * summed bonus total. Titles/bodies are truncated to the notice limits.
 */
export function buildGoalReachedMessage(awards: GoalReachedAwardInput[]): ProgramMessage {
  if (awards.length === 1) {
    const a = awards[0]!;
    return {
      title: truncate(`Goal reached: ${a.goalTitle}`, INSPECTOR_NOTICE_TITLE_MAX),
      body: truncate(
        `You reached "${a.goalTitle}" for ${messagePeriodText(a.periodType, a.periodStart)}. ` +
          `Your $${a.amount.toFixed(2)} bonus will be reviewed and, once approved, added to your next invoice.`,
        INSPECTOR_NOTICE_BODY_MAX,
      ),
    };
  }

  const quotedTitles = awards.map((a) => `"${a.goalTitle}"`);
  const list = joinWithAnd(quotedTitles);
  const total = awards.reduce((sum, a) => sum + a.amount, 0);
  return {
    title: truncate(`You reached ${awards.length} goals`, INSPECTOR_NOTICE_TITLE_MAX),
    body: truncate(
      `You reached ${list}. Your bonuses (total $${total.toFixed(2)}) will be reviewed and, ` +
        `once approved, added to your next invoice.`,
      INSPECTOR_NOTICE_BODY_MAX,
    ),
  };
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface LevelChangeInput {
  newLevel: InspectorLevel;
  prevLevel: InspectorLevel;
  score: number;
  thresholds: { silverMinScore: number; goldMinScore: number };
}

const LEVEL_ORDER: Record<InspectorLevel, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };

/** The "you changed level" message (L-F08-06). Up = encouragement; down = the threshold to regain. */
export function buildLevelChangeMessage({ newLevel, prevLevel, score, thresholds }: LevelChangeInput): ProgramMessage {
  const title = `You're now ${INSPECTOR_LEVEL_LABELS[newLevel]}`;
  const scoreText = score.toFixed(1);
  if (LEVEL_ORDER[newLevel] > LEVEL_ORDER[prevLevel]) {
    return { title, body: `Your reliability index is ${scoreText}. Keep it up to stay at ${INSPECTOR_LEVEL_LABELS[newLevel]}.` };
  }
  const regainThreshold = minScoreForLevel(prevLevel, thresholds).toFixed(1);
  return {
    title,
    body: `Your reliability index is ${scoreText}. Reach ${regainThreshold} to get back to ${INSPECTOR_LEVEL_LABELS[prevLevel]}.`,
  };
}

export interface StreakRiskInput {
  cycle: BillingPeriodType;
  count: number;
}

/** The "your streak is at risk" message on the last day of the cycle. */
export function buildStreakRiskMessage({ cycle, count }: StreakRiskInput): ProgramMessage {
  return {
    title: `Your ${count}-${CYCLE_NOUN[cycle]} streak is at risk`,
    body: `Today is the last day of the ${CYCLE_NOUN[cycle]}. Reach any ${CYCLE_ADJ[cycle]} goal to keep your streak going.`,
  };
}
