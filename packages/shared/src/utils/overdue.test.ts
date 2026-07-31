import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OVERDUE_AGE_DAYS,
  OVERDUE_AUTO_CANCEL_STATUSES,
  OVERDUE_ELIGIBLE_STATUSES,
  isAppointmentOverdue,
  overdueCreatedBeforeCivilDate,
} from './overdue';

/**
 * Reference clock: 2026-03-29T10:00:00Z is 2026-03-29 21:00 in Sydney (AEDT, +11),
 * so "today" is 2026-03-29 and the cutoff civil date is 2026-02-12 — exactly 45
 * days earlier. An appointment created ON 2026-02-12 is 45 days old and NOT yet
 * overdue; one created on 2026-02-11 is 46 days old and IS overdue.
 */
const TODAY = '2026-03-29';
const CUTOFF = '2026-02-12';

describe('overdue age rule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constants', () => {
    it('uses a 45-day age threshold', () => {
      expect(OVERDUE_AGE_DAYS).toBe(45);
    });

    it('treats DRAFT as badge/filter eligible', () => {
      expect([...OVERDUE_ELIGIBLE_STATUSES]).toEqual([
        'DRAFT',
        'AWAITING_INSPECTOR',
        'SCHEDULED',
      ]);
    });

    it('excludes DRAFT from the auto-cancel subset — it is the operator repair state', () => {
      expect([...OVERDUE_AUTO_CANCEL_STATUSES]).toEqual(['AWAITING_INSPECTOR', 'SCHEDULED']);
      expect(OVERDUE_AUTO_CANCEL_STATUSES).not.toContain('DRAFT');
    });

    it('keeps the auto-cancel set a subset of the eligible set', () => {
      for (const status of OVERDUE_AUTO_CANCEL_STATUSES) {
        expect(OVERDUE_ELIGIBLE_STATUSES).toContain(status);
      }
    });
  });

  describe('overdueCreatedBeforeCivilDate', () => {
    it('returns today minus 45 civil days in Sydney', () => {
      expect(overdueCreatedBeforeCivilDate()).toBe(CUTOFF);
    });

    it('is exactly 45 days before today', () => {
      const days =
        (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${CUTOFF}T00:00:00Z`)) / 86_400_000;
      expect(days).toBe(OVERDUE_AGE_DAYS);
    });

    it('follows the Sydney civil day, not the UTC one', () => {
      // 2026-03-29T14:00Z = 2026-03-30 01:00 in Sydney: the Sydney day has rolled
      // over while UTC is still on the 29th, so the cutoff advances too.
      vi.setSystemTime(new Date('2026-03-29T14:00:00Z'));
      expect(overdueCreatedBeforeCivilDate()).toBe('2026-02-13');
    });

    it('accepts an injected now, matching startOfOverdueAgeCutoff on the backend', () => {
      // Same signature shape as the backend cutoff helper, so the parity between the
      // two can be checked without reaching for global fake timers.
      expect(overdueCreatedBeforeCivilDate(new Date('2026-03-29T14:00:00Z'))).toBe('2026-02-13');
      expect(overdueCreatedBeforeCivilDate(new Date('2026-03-29T10:00:00Z'))).toBe(CUTOFF);
    });
  });

  describe('isAppointmentOverdue', () => {
    it('is overdue on day 46', () => {
      expect(isAppointmentOverdue({ status: 'SCHEDULED', createdAt: '2026-02-11' })).toBe(true);
    });

    it('is NOT overdue on day 45 — the boundary is strict', () => {
      expect(isAppointmentOverdue({ status: 'SCHEDULED', createdAt: CUTOFF })).toBe(false);
    });

    it('is overdue for a long-stale AWAITING_INSPECTOR appointment', () => {
      expect(
        isAppointmentOverdue({ status: 'AWAITING_INSPECTOR', createdAt: '2025-11-01' }),
      ).toBe(true);
    });

    it('is overdue for a stale DRAFT (badge/filter scope now includes it)', () => {
      expect(isAppointmentOverdue({ status: 'DRAFT', createdAt: '2025-11-01' })).toBe(true);
    });

    it('is not overdue for a freshly created appointment', () => {
      expect(isAppointmentOverdue({ status: 'SCHEDULED', createdAt: '2026-03-28' })).toBe(false);
    });

    it.each(['DONE', 'CANCELLED', 'REJECTED'])(
      'is never overdue for terminal status %s, however old',
      (status) => {
        expect(isAppointmentOverdue({ status, createdAt: '2020-01-01' })).toBe(false);
      },
    );

    it('ignores the scheduled date entirely — a future date does not rescue a stale record', () => {
      // The old rule keyed on scheduled_date; a future date meant "not overdue".
      // Under the age rule only createdAt matters.
      expect(isAppointmentOverdue({ status: 'SCHEDULED', createdAt: '2025-01-01' })).toBe(true);
    });

    it('accepts Date instants', () => {
      expect(
        isAppointmentOverdue({ status: 'SCHEDULED', createdAt: new Date('2026-02-11T03:00:00Z') }),
      ).toBe(true);
    });

    it('accepts ISO datetime strings', () => {
      expect(
        isAppointmentOverdue({ status: 'SCHEDULED', createdAt: '2026-02-11T03:00:00.000Z' }),
      ).toBe(true);
    });

    it('resolves ISO strings through Sydney, not by reading their UTC date prefix', () => {
      // 2026-02-11T14:00Z is already 2026-02-12 in Sydney, so this is the cutoff day
      // and NOT overdue — a `.split('T')[0]` reading would wrongly say overdue.
      // createdAt arrives on the wire as instantStr(), so this is the common case.
      expect(
        isAppointmentOverdue({ status: 'SCHEDULED', createdAt: '2026-02-11T14:00:00.000Z' }),
      ).toBe(false);
    });
  });

  /**
   * `created_at` is a real instant (unlike `scheduled_date`, which is a `@db.Date`
   * pinned to UTC midnight). Reading its UTC date instead of its Sydney civil date
   * shifts the answer by a day for anything created inside the Sydney-ahead-of-UTC
   * window — these two cases are 2h apart and must land on opposite sides.
   */
  describe('Sydney civil-day anchoring of createdAt', () => {
    it('is NOT overdue when the instant is already the cutoff day in Sydney', () => {
      // 2026-02-11T14:00Z = 2026-02-12 01:00 Sydney → civil date 2026-02-12 = cutoff.
      // A naive UTC read would see 2026-02-11 and wrongly report overdue.
      expect(
        isAppointmentOverdue({ status: 'SCHEDULED', createdAt: new Date('2026-02-11T14:00:00Z') }),
      ).toBe(false);
    });

    it('is overdue when the instant is still before the cutoff day in Sydney', () => {
      // 2026-02-11T12:00Z = 2026-02-11 23:00 Sydney → civil date 2026-02-11 < cutoff.
      expect(
        isAppointmentOverdue({ status: 'SCHEDULED', createdAt: new Date('2026-02-11T12:00:00Z') }),
      ).toBe(true);
    });

    it('flips a borderline record once the Sydney day rolls over', () => {
      const borderline = { status: 'SCHEDULED', createdAt: CUTOFF };
      expect(isAppointmentOverdue(borderline)).toBe(false);
      // 2026-03-29T14:00Z = 2026-03-30 01:00 Sydney: today advances, so does the cutoff.
      vi.setSystemTime(new Date('2026-03-29T14:00:00Z'));
      expect(isAppointmentOverdue(borderline)).toBe(true);
    });
  });
});
