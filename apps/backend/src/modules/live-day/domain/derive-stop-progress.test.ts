import { describe, it, expect } from 'vitest';
import { deriveStopProgress } from './derive-stop-progress';
import { makeStopRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

const stop = (
  appointmentId: string,
  sequence: number | null,
  fields: Partial<LiveDayStopRow> = {},
): LiveDayStopRow => makeStopRow({ appointmentId, sequence, ...fields });

const FINISHED = { status: 'SCHEDULED' as const, startedAt: '2026-11-05T09:00:00Z', finishedAt: '2026-11-05T09:40:00Z' };
const NOT_STARTED = { status: 'SCHEDULED' as const, startedAt: null, finishedAt: null };

describe('deriveStopProgress (§3, test 2)', () => {
  it('[A FINISHED, B IN_PROGRESS, C NOT_STARTED] -> A DONE, B CURRENT, C REMAINING', () => {
    const p = deriveStopProgress([
      stop('A', 1, FINISHED),
      stop('B', 2, { status: 'SCHEDULED', startedAt: '2026-11-05T10:00:00Z', finishedAt: null }),
      stop('C', 3, NOT_STARTED),
    ]);
    expect([p.get('A'), p.get('B'), p.get('C')]).toEqual(['DONE', 'CURRENT', 'REMAINING']);
  });

  it('[A FINISHED, B NOT_STARTED, C NOT_STARTED] -> A DONE, B CURRENT (next), C REMAINING', () => {
    const p = deriveStopProgress([stop('A', 1, FINISHED), stop('B', 2, NOT_STARTED), stop('C', 3, NOT_STARTED)]);
    expect([p.get('A'), p.get('B'), p.get('C')]).toEqual(['DONE', 'CURRENT', 'REMAINING']);
  });

  it('[A NOT_STARTED, B NOT_STARTED] -> A CURRENT, B REMAINING', () => {
    const p = deriveStopProgress([stop('A', 1, NOT_STARTED), stop('B', 2, NOT_STARTED)]);
    expect([p.get('A'), p.get('B')]).toEqual(['CURRENT', 'REMAINING']);
  });

  it('all FINISHED -> all DONE, none CURRENT', () => {
    const p = deriveStopProgress([stop('A', 1, FINISHED), stop('B', 2, FINISHED)]);
    expect([p.get('A'), p.get('B')]).toEqual(['DONE', 'DONE']);
    expect([...p.values()]).not.toContain('CURRENT');
  });

  it('forgotten check-out: [A IN_PROGRESS 09:00, B IN_PROGRESS 10:00] -> A OPEN, B CURRENT', () => {
    const p = deriveStopProgress([
      stop('A', 1, { status: 'SCHEDULED', startedAt: '2026-11-05T09:00:00Z', finishedAt: null }),
      stop('B', 2, { status: 'SCHEDULED', startedAt: '2026-11-05T10:00:00Z', finishedAt: null }),
    ]);
    expect([p.get('A'), p.get('B')]).toEqual(['OPEN', 'CURRENT']);
  });

  it('abandoned execution counts as not-started (REMAINING or CURRENT by position)', () => {
    const p = deriveStopProgress([
      stop('A', 1, FINISHED),
      stop('B', 2, { status: 'SCHEDULED', startedAt: '2026-11-05T08:20:00Z', abandonedAt: '2026-11-05T08:30:00Z', finishedAt: null }),
    ]);
    expect([p.get('A'), p.get('B')]).toEqual(['DONE', 'CURRENT']);
  });

  it('DONE without execution -> DONE', () => {
    const p = deriveStopProgress([stop('A', 1, { status: 'DONE', startedAt: null, finishedAt: null }), stop('B', 2, NOT_STARTED)]);
    expect([p.get('A'), p.get('B')]).toEqual(['DONE', 'CURRENT']);
  });

  it('out-of-plan stop (sequence null) is ordered after plan stops by window', () => {
    const p = deriveStopProgress([
      stop('OUT', null, { ...NOT_STARTED, windowStartAt: '2026-11-05T06:00:00Z' }),
      stop('A', 1, NOT_STARTED),
    ]);
    // A (in plan) becomes CURRENT even though OUT has an earlier window, because plan stops come first.
    expect([p.get('A'), p.get('OUT')]).toEqual(['CURRENT', 'REMAINING']);
  });
});
