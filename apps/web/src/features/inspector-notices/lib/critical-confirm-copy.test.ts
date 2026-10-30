import { describe, it, expect } from 'vitest';
import { buildPublishConfirmCopy } from './critical-confirm-copy';

// Sydney is AEDT (UTC+11) in November, so a UTC instant + 11h is the Sydney wall time.
const BASE = "Notices can't be edited or deleted after publishing. You can archive them later.";
const CRITICAL = 'Critical notices are sent by push, or by SMS to inspectors without push.';
// A midday Sydney instant (10:00 am) — never in the night window.
const DAYTIME = new Date('2026-11-09T23:00:00Z');

describe('buildPublishConfirmCopy', () => {
  it('non-critical shows only the base line', () => {
    expect(buildPublishConfirmCopy({ critical: false, audienceSize: 10, now: DAYTIME })).toEqual([BASE]);
  });

  it('critical adds the channel line and the SMS ceiling', () => {
    const lines = buildPublishConfirmCopy({ critical: true, audienceSize: 42, now: DAYTIME });
    expect(lines).toEqual([BASE, CRITICAL, 'Up to 42 inspectors may receive an SMS.']);
  });

  it('critical with one inspector is singular', () => {
    const lines = buildPublishConfirmCopy({ critical: true, audienceSize: 1, now: DAYTIME });
    expect(lines).toContain('Up to 1 inspector may receive an SMS.');
  });

  it('critical with an unknown audience size uses the no-number fallback', () => {
    const lines = buildPublishConfirmCopy({ critical: true, audienceSize: null, now: DAYTIME });
    expect(lines).toContain('Inspectors without push may receive an SMS.');
    expect(lines.join(' ')).not.toMatch(/Up to/);
  });

  it('critical at night (Sydney) adds the time phrase', () => {
    // 22:40 Sydney = 11:40 UTC.
    const lines = buildPublishConfirmCopy({ critical: true, audienceSize: 5, now: new Date('2026-11-10T11:40:00Z') });
    expect(lines).toContain("It's 10:40 pm in Sydney. Inspectors will be notified now.");
  });

  it('critical in the daytime has no time phrase', () => {
    const lines = buildPublishConfirmCopy({ critical: true, audienceSize: 5, now: DAYTIME });
    expect(lines.join(' ')).not.toMatch(/in Sydney/);
  });

  it.each([
    ['2026-11-10T09:59:00Z', false], // 20:59 Sydney — before the window
    ['2026-11-10T10:00:00Z', true], //  21:00 Sydney — window start
    ['2026-11-09T19:59:00Z', true], //  06:59 Sydney — still in the window
    ['2026-11-09T20:00:00Z', false], // 07:00 Sydney — window end
  ])('night-window boundary at %s → phrase: %s', (iso, expected) => {
    const lines = buildPublishConfirmCopy({ critical: true, audienceSize: 3, now: new Date(iso) });
    expect(lines.some((l) => l.includes('in Sydney'))).toBe(expected);
  });

  it('non-critical never shows SMS or time phrases even at night', () => {
    const lines = buildPublishConfirmCopy({ critical: false, audienceSize: null, now: new Date('2026-11-10T11:40:00Z') });
    expect(lines).toEqual([BASE]);
  });
});
