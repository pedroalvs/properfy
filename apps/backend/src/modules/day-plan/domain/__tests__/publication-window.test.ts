import { describe, it, expect } from 'vitest';
import { isPublicationOpen, isPublicationOpenForInspector } from '../publication-window';

// 2026-11-05 in Sydney (AEDT, UTC+11) publishes at 19:30 on 2026-11-04 = 2026-11-04T08:30:00Z.
const OPEN_AT = new Date('2026-11-04T08:30:00.000Z');

describe('isPublicationOpen', () => {
  it('opens exactly at 19:30 the evening before (inspector timezone)', () => {
    expect(isPublicationOpen('2026-11-05', OPEN_AT, 'Australia/Sydney')).toBe(true);
    expect(isPublicationOpen('2026-11-05', new Date(OPEN_AT.getTime() - 1), 'Australia/Sydney')).toBe(false);
  });

  it('is open for today and past dates', () => {
    const now = new Date('2026-11-05T02:00:00.000Z');
    expect(isPublicationOpen('2026-11-05', now, 'Australia/Sydney')).toBe(true); // today
    expect(isPublicationOpen('2026-11-01', now, 'Australia/Sydney')).toBe(true); // past
  });

  it('is closed for D+2', () => {
    const now = new Date('2026-11-04T09:00:00.000Z'); // after D+1 window opened
    expect(isPublicationOpen('2026-11-06', now, 'Australia/Sydney')).toBe(false);
  });
});

describe('isPublicationOpenForInspector', () => {
  it('requires the window open in BOTH the inspector and platform timezones', () => {
    // Inspector in Perth (AWST, UTC+8): 19:30 Perth on 2026-11-04 = 2026-11-04T11:30:00Z.
    // Platform (Sydney) opened at 08:30Z. At 11:31Z both are open.
    const bothOpen = new Date('2026-11-04T11:31:00.000Z');
    expect(isPublicationOpenForInspector('2026-11-05', bothOpen, 'Australia/Perth')).toBe(true);

    // A timezone AHEAD of the platform: Auckland (NZDT, UTC+13) opens at 2026-11-04T06:30:00Z,
    // before Sydney's 08:30Z — the platform window gates it.
    const aucklandOnly = new Date('2026-11-04T06:31:00.000Z');
    expect(isPublicationOpenForInspector('2026-11-05', aucklandOnly, 'Pacific/Auckland')).toBe(false);
    const afterPlatform = new Date('2026-11-04T08:31:00.000Z');
    expect(isPublicationOpenForInspector('2026-11-05', afterPlatform, 'Pacific/Auckland')).toBe(true);
  });
});
