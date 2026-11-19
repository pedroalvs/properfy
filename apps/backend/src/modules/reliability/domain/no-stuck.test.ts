import { describe, it, expect } from 'vitest';
import { evaluateNoStuck } from './no-stuck';
import { buildFact, wallAt } from './__fixtures__/service-facts';

const D = '2026-11-10';
const startedAt = wallAt(D, '09:00');
const hours = (h: number, m = 0) => new Date(startedAt.getTime() + (h * 60 + m) * 60 * 1000);

describe('evaluateNoStuck', () => {
  it('is OK at 5h59 and exactly 6h, STUCK at 6h01', () => {
    expect(evaluateNoStuck(buildFact({ startedAt, finishedAt: hours(5, 59) }))).toBe('OK');
    expect(evaluateNoStuck(buildFact({ startedAt, finishedAt: hours(6, 0) }))).toBe('OK');
    expect(evaluateNoStuck(buildFact({ startedAt, finishedAt: hours(6, 1) }))).toBe('STUCK');
  });

  it('excludes a reopened execution (resumedAt set)', () => {
    expect(evaluateNoStuck(buildFact({ startedAt, finishedAt: hours(7), resumedAt: hours(1) }))).toBe('EXCLUDED');
  });

  it('excludes non-EXECUTED kinds', () => {
    expect(evaluateNoStuck(buildFact({ kind: 'DONE_WITHOUT_EXECUTION' }))).toBe('EXCLUDED');
    expect(evaluateNoStuck(buildFact({ kind: 'CANT_ATTEND' }))).toBe('EXCLUDED');
    expect(evaluateNoStuck(buildFact({ kind: 'NO_SHOW_REJECTED' }))).toBe('EXCLUDED');
  });

  it('measures a restarted execution (F03 D13) from the restart startedAt', () => {
    // started fresh at 13:00 (restart), finished 14:00 → 1h → OK, even though the
    // original attempt could have been hours earlier; the fact carries the restart start.
    const restart = wallAt(D, '13:00');
    const finished = wallAt(D, '14:00');
    expect(evaluateNoStuck(buildFact({ startedAt: restart, finishedAt: finished, resumedAt: null }))).toBe('OK');
  });
});
