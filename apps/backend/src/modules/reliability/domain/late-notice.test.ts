import { describe, it, expect } from 'vitest';
import { advanceNoticeDeadline, wasNotifiedInAdvance } from './late-notice';
import { buildFact, wallAt } from './__fixtures__/service-facts';
import type { LateNoticeEvent } from './service-fact';

const D = '2026-11-10';
const notice = (createdAt: Date, clientOccurredAt: Date | null = null): LateNoticeEvent => ({
  clientOccurredAt,
  createdAt,
});

describe('advanceNoticeDeadline', () => {
  it('is the published ETA when the stop has one', () => {
    const fact = buildFact({ publishedEtaAt: wallAt(D, '10:50'), windowStartAt: wallAt(D, '09:00') });
    expect(advanceNoticeDeadline(fact)).toEqual(wallAt(D, '10:50'));
  });

  it('falls back to the window start without a plan (or a stop with null published ETA)', () => {
    const fact = buildFact({ publishedEtaAt: null, windowStartAt: wallAt(D, '09:00') });
    expect(advanceNoticeDeadline(fact)).toEqual(wallAt(D, '09:00'));
  });
});

describe('wasNotifiedInAdvance — with a published ETA 10:50', () => {
  const base = { publishedEtaAt: wallAt(D, '10:50'), windowStartAt: wallAt(D, '09:00') };
  it.each([
    ['10:30', true],
    ['10:49', true],
    ['10:50', false],
    ['10:55', false],
  ] as const)('notice at %s → %s', (time, expected) => {
    const fact = buildFact({ ...base, lateNotices: [notice(wallAt(D, time))] });
    expect(wasNotifiedInAdvance(fact)).toBe(expected);
  });
});

describe('wasNotifiedInAdvance — without a plan (window start 09:00)', () => {
  const base = { publishedEtaAt: null, windowStartAt: wallAt(D, '09:00') };
  it.each([
    ['08:30', true],
    ['08:59', true],
    ['09:00', false],
    ['09:20', false],
  ] as const)('notice at %s → %s', (time, expected) => {
    const fact = buildFact({ ...base, lateNotices: [notice(wallAt(D, time))] });
    expect(wasNotifiedInAdvance(fact)).toBe(expected);
  });
});

describe('wasNotifiedInAdvance — effective notice time (P4)', () => {
  const base = { publishedEtaAt: wallAt(D, '10:50'), windowStartAt: wallAt(D, '09:00') };

  it('uses a plausible client time over created_at', () => {
    const fact = buildFact({ ...base, lateNotices: [notice(wallAt(D, '10:58'), wallAt(D, '10:40'))] });
    expect(wasNotifiedInAdvance(fact)).toBe(true);
  });

  it('uses created_at when no client time is present', () => {
    const fact = buildFact({ ...base, lateNotices: [notice(wallAt(D, '10:58'), null)] });
    expect(wasNotifiedInAdvance(fact)).toBe(false);
  });

  it('uses a client time 25h before created_at (plausible within 7 days)', () => {
    const created = wallAt(D, '10:58');
    const client = new Date(created.getTime() - 25 * 60 * 60 * 1000);
    const fact = buildFact({ ...base, lateNotices: [notice(created, client)] });
    expect(wasNotifiedInAdvance(fact)).toBe(true);
  });

  it('falls back to created_at for a client time 7 days + 1 min before (implausible)', () => {
    const created = wallAt(D, '10:58');
    const client = new Date(created.getTime() - (7 * 24 * 60 + 1) * 60 * 1000);
    const fact = buildFact({ ...base, lateNotices: [notice(created, client)] });
    expect(wasNotifiedInAdvance(fact)).toBe(false);
  });

  it('falls back to created_at for a client time 6 min after created_at (implausible)', () => {
    const created = wallAt(D, '10:58');
    const client = new Date(created.getTime() + 6 * 60 * 1000);
    const fact = buildFact({ ...base, lateNotices: [notice(created, client)] });
    expect(wasNotifiedInAdvance(fact)).toBe(false);
  });

  it('takes the earliest effective notice when several exist', () => {
    const fact = buildFact({
      ...base,
      lateNotices: [notice(wallAt(D, '10:55')), notice(wallAt(D, '10:30'))],
    });
    expect(wasNotifiedInAdvance(fact)).toBe(true);
  });

  it('is false with no notices', () => {
    expect(wasNotifiedInAdvance(buildFact({ ...base, lateNotices: [] }))).toBe(false);
  });
});
