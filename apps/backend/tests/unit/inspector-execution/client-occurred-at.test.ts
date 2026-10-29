import { describe, it, expect } from 'vitest';
import { resolveEffectiveEventTime } from '../../../src/modules/inspector-execution/domain/client-occurred-at';

const serverNow = new Date('2026-11-03T09:20:00.000Z');
const minus = (ms: number) => new Date(serverNow.getTime() - ms).toISOString();
const plus = (ms: number) => new Date(serverNow.getTime() + ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe('resolveEffectiveEventTime', () => {
  it('returns server time with null plausibility when no client time is sent', () => {
    expect(resolveEffectiveEventTime(undefined, serverNow)).toEqual({ effectiveAt: serverNow, clientTimePlausible: null });
    expect(resolveEffectiveEventTime(null, serverNow)).toEqual({ effectiveAt: serverNow, clientTimePlausible: null });
  });

  it('uses the client time when 3 hours in the past (plausible)', () => {
    const r = resolveEffectiveEventTime(minus(3 * 60 * MIN), serverNow);
    expect(r.clientTimePlausible).toBe(true);
    expect(r.effectiveAt.getTime()).toBe(serverNow.getTime() - 3 * 60 * MIN);
  });

  it('uses the client time when 3 days in the past (Friday → Monday sync)', () => {
    const r = resolveEffectiveEventTime(minus(3 * DAY), serverNow);
    expect(r.clientTimePlausible).toBe(true);
  });

  it('treats exactly 7 days in the past as plausible, 7 days + 1 min as implausible', () => {
    expect(resolveEffectiveEventTime(minus(7 * DAY), serverNow).clientTimePlausible).toBe(true);
    const r = resolveEffectiveEventTime(minus(7 * DAY + MIN), serverNow);
    expect(r.clientTimePlausible).toBe(false);
    expect(r.effectiveAt).toBe(serverNow);
  });

  it('allows up to 5 minutes of future skew, rejects 6', () => {
    expect(resolveEffectiveEventTime(plus(4 * MIN), serverNow).clientTimePlausible).toBe(true);
    const r = resolveEffectiveEventTime(plus(6 * MIN), serverNow);
    expect(r.clientTimePlausible).toBe(false);
    expect(r.effectiveAt).toBe(serverNow);
  });

  it('treats an unparseable client time as implausible', () => {
    const r = resolveEffectiveEventTime('not-a-date', serverNow);
    expect(r.clientTimePlausible).toBe(false);
    expect(r.effectiveAt).toBe(serverNow);
  });
});
