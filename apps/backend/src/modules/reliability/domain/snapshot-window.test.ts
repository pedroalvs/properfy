import { describe, expect, it } from 'vitest';
import { snapshotDateFor, snapshotWindow } from './snapshot-window';

describe('snapshotWindow', () => {
  it('covers the 30 complete civil days up to yesterday', () => {
    expect(snapshotWindow('2026-12-01')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('crosses a month boundary with a short February', () => {
    expect(snapshotWindow('2026-03-01')).toEqual({ from: '2026-01-30', to: '2026-02-28' });
  });
});

describe('snapshotDateFor', () => {
  it('resolves the Sydney civil date of the instant (AEDT), ignoring the process TZ', () => {
    // 2026-11-30T13:30:00Z is 2026-12-01 00:30 in Sydney (AEDT, UTC+11).
    expect(snapshotDateFor(new Date('2026-11-30T13:30:00Z'))).toBe('2026-12-01');
  });

  it('is stable under TZ=America/Los_Angeles', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(snapshotDateFor(new Date('2026-11-30T13:30:00Z'))).toBe('2026-12-01');
    } finally {
      process.env.TZ = original;
    }
  });
});
