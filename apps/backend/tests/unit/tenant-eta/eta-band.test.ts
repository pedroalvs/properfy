import { isGsm7 } from '@properfy/shared';
import { describe, expect, it } from 'vitest';

import {
  computeEtaBand,
  formatEtaBand,
  wallTimeHHmm,
} from '../../../src/modules/tenant-eta/domain/eta-band';

const TZ = 'Australia/Sydney';
const at = (iso: string): Date => new Date(iso);
// Sydney AEDT = UTC+11 in November 2026.
const win = (startIso: string, endIso: string) => ({ windowStartAt: at(startIso), windowEndAt: at(endIso) });
// A..C windows in UTC
const WIN_A = win('2026-11-04T21:00:00.000Z', '2026-11-04T23:00:00.000Z'); // 08:00–10:00
const WIN_B = win('2026-11-04T22:00:00.000Z', '2026-11-05T01:00:00.000Z'); // 09:00–12:00
const WIN_C = win('2026-11-04T23:00:00.000Z', '2026-11-05T00:00:00.000Z'); // 10:00–11:00

const band = (startIso: string, w: ReturnType<typeof win>, nowIso: string) =>
  formatEtaBand(computeEtaBand(at(startIso), w, at(nowIso)), TZ);

describe('computeEtaBand / formatEtaBand', () => {
  it('A at 07:00 (E1): 08:00 → 8:00–8:30 am (lower clip to window start)', () => {
    expect(band('2026-11-04T21:00:00.000Z', WIN_A, '2026-11-04T20:00:00.000Z')).toEqual({
      from: '8:00 am',
      to: '8:30 am',
    });
  });

  it('B/C at 07:00 (E1)', () => {
    expect(band('2026-11-04T22:00:00.000Z', WIN_B, '2026-11-04T20:00:00.000Z')).toEqual({ from: '9:00 am', to: '9:30 am' });
    expect(band('2026-11-04T23:25:00.000Z', WIN_C, '2026-11-04T20:00:00.000Z')).toEqual({ from: '10:00 am', to: '10:55 am' });
  });

  it('B at 08:55:20 (E2): 09:10:20 → centre 09:10 → 9:00–9:40 am', () => {
    expect(band('2026-11-04T22:10:20.000Z', WIN_B, '2026-11-04T21:55:20.000Z')).toEqual({ from: '9:00 am', to: '9:40 am' });
  });

  it('C at 11:00 (E3b, late): 11:25 → 11:00–11:55 am (no upper clip past the window)', () => {
    expect(band('2026-11-05T00:25:00.000Z', WIN_C, '2026-11-05T00:00:00.000Z')).toEqual({ from: '11:00 am', to: '11:55 am' });
  });

  it('C at 08:20 (E4b): 11:25 → 10:55–11:55 am', () => {
    expect(band('2026-11-05T00:25:00.000Z', WIN_C, '2026-11-04T21:20:00.000Z')).toEqual({ from: '10:55 am', to: '11:55 am' });
  });

  it('wide window never shows the whole window', () => {
    const wide = win('2026-11-04T21:00:00.000Z', '2026-11-05T03:00:00.000Z'); // 08:00–14:00
    expect(band('2026-11-04T23:30:00.000Z', wide, '2026-11-04T20:00:00.000Z')).toEqual({ from: '10:00 am', to: '11:00 am' });
  });

  it('upper clip to the window end when the centre is inside it', () => {
    const w = win('2026-11-04T22:00:00.000Z', '2026-11-04T23:00:00.000Z'); // 09:00–10:00
    expect(band('2026-11-04T22:50:00.000Z', w, '2026-11-04T20:00:00.000Z')).toEqual({ from: '9:20 am', to: '10:00 am' });
  });

  it('rounds the centre to 5 minutes, half up (absolute instant)', () => {
    const w = win('2026-11-04T20:00:00.000Z', '2026-11-05T04:00:00.000Z');
    // 10:22:29 → 10:20 (band 09:50–10:50)
    expect(band('2026-11-04T23:22:29.000Z', w, '2026-11-04T19:00:00.000Z')).toEqual({ from: '9:50 am', to: '10:50 am' });
    // 10:22:30 → 10:25
    expect(band('2026-11-04T23:22:30.000Z', w, '2026-11-04T19:00:00.000Z')).toEqual({ from: '9:55 am', to: '10:55 am' });
  });

  it('floors to "now" (ceil 5): now 09:03, start 09:05 → from 09:05', () => {
    const w = win('2026-11-04T20:00:00.000Z', '2026-11-05T04:00:00.000Z');
    const res = formatEtaBand(computeEtaBand(at('2026-11-04T22:05:00.000Z'), w, at('2026-11-04T22:03:00.000Z')), TZ);
    expect(res.from).toBe('9:05 am');
  });

  it('degenerate: window 09:00–10:00, start 10:00, now 10:07 → 10:10–10:40 am fallback', () => {
    const w = win('2026-11-04T22:00:00.000Z', '2026-11-04T23:00:00.000Z');
    expect(band('2026-11-04T23:00:00.000Z', w, '2026-11-04T23:07:00.000Z')).toEqual({ from: '10:10 am', to: '10:40 am' });
  });

  it('noon crossing: 12:00 → 11:30 am / 12:30 pm', () => {
    const w = win('2026-11-04T20:00:00.000Z', '2026-11-05T05:00:00.000Z');
    expect(band('2026-11-05T01:00:00.000Z', w, '2026-11-04T19:00:00.000Z')).toEqual({ from: '11:30 am', to: '12:30 pm' });
  });

  it('wallTimeHHmm formats the same instant per timezone (never 24:00)', () => {
    const instant = at('2026-11-04T23:00:00.000Z');
    expect(wallTimeHHmm(instant, 'Australia/Brisbane')).toBe('09:00');
    expect(wallTimeHHmm(instant, 'Australia/Adelaide')).toBe('09:30');
    expect(wallTimeHHmm(instant, 'Australia/Perth')).toBe('07:00');
    expect(wallTimeHHmm(instant, 'Australia/Sydney')).toBe('10:00');
    // midnight renders 00:00, never 24:00
    expect(wallTimeHHmm(at('2026-11-04T13:00:00.000Z'), 'Australia/Sydney')).toBe('00:00');
  });

  it('DST: both boundaries format to 9:00 am', () => {
    // 2026-10-04 start of Sydney DST
    expect(formatWall(at('2026-10-03T22:00:00.000Z'))).toBe('9:00 am');
    // 2026-04-05 end of Sydney DST
    expect(formatWall(at('2026-04-04T23:00:00.000Z'))).toBe('9:00 am');
  });

  function formatWall(instant: Date): string {
    const { from } = formatEtaBand({ from: instant, to: instant }, TZ);
    return from;
  }

  it('output is always GSM-7', () => {
    const r = band('2026-11-04T23:25:00.000Z', WIN_C, '2026-11-04T21:20:00.000Z');
    expect(isGsm7(r.from + r.to)).toBe(true);
  });
});
