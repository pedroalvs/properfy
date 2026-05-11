/**
 * T-4-101 — pin the appointment transition matrix so frontend gating and
 * backend early-rejection stay synchronized. Each transition in
 * `CLAUDE.md §5` has at least one row here. If the matrix diverges from
 * the backend's `AppointmentStateMachine` domain table, the contract
 * test in `apps/backend/tests/unit/appointment/state-machine.test.ts`
 * (existing) will catch it on the other side.
 */

import { describe, it, expect } from 'vitest';
import {
  getValidTransitions,
  isReasonRequired,
  isTransitionDefined,
  type ClUserFlags,
} from './appointment-transitions';
import { AppointmentStatus } from '../enums';

describe('getValidTransitions — DRAFT', () => {
  it('OP can release to AWAITING_INSPECTOR + REJECTED + CANCELLED', () => {
    expect(getValidTransitions(AppointmentStatus.DRAFT, 'OP')).toEqual([
      AppointmentStatus.AWAITING_INSPECTOR,
      AppointmentStatus.REJECTED,
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('AM can reject + cancel (cannot release to AWAITING_INSPECTOR — OP only per CLAUDE.md §5)', () => {
    expect(getValidTransitions(AppointmentStatus.DRAFT, 'AM')).toEqual([
      AppointmentStatus.REJECTED,
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('CL_ADMIN can cancel only', () => {
    expect(getValidTransitions(AppointmentStatus.DRAFT, 'CL_ADMIN')).toEqual([
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('CL_USER without flags can transition to nothing', () => {
    expect(getValidTransitions(AppointmentStatus.DRAFT, 'CL_USER')).toEqual([]);
  });

  it('CL_USER with cancel_appointments flag can cancel', () => {
    const flags: ClUserFlags = { cancel_appointments: true };
    expect(getValidTransitions(AppointmentStatus.DRAFT, 'CL_USER', flags)).toEqual([
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('INSP cannot perform any DRAFT transition', () => {
    expect(getValidTransitions(AppointmentStatus.DRAFT, 'INSP')).toEqual([]);
  });
});

describe('getValidTransitions — AWAITING_INSPECTOR', () => {
  it('OP/AM/CL_ADMIN can cancel', () => {
    for (const role of ['OP', 'AM', 'CL_ADMIN'] as const) {
      expect(getValidTransitions(AppointmentStatus.AWAITING_INSPECTOR, role)).toEqual([
        AppointmentStatus.CANCELLED,
      ]);
    }
  });

  it('SCHEDULED transition is NOT in the bulk matrix (inspector accept is system-driven)', () => {
    expect(getValidTransitions(AppointmentStatus.AWAITING_INSPECTOR, 'OP')).not.toContain(
      AppointmentStatus.SCHEDULED,
    );
  });
});

describe('getValidTransitions — SCHEDULED', () => {
  it('OP can cancel + reject', () => {
    expect(getValidTransitions(AppointmentStatus.SCHEDULED, 'OP')).toEqual([
      AppointmentStatus.CANCELLED,
      AppointmentStatus.REJECTED,
    ]);
  });

  it('AM/CL_ADMIN can cancel only (reject is OP-only on SCHEDULED)', () => {
    expect(getValidTransitions(AppointmentStatus.SCHEDULED, 'AM')).toEqual([
      AppointmentStatus.CANCELLED,
    ]);
    expect(getValidTransitions(AppointmentStatus.SCHEDULED, 'CL_ADMIN')).toEqual([
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('DONE transition is NOT in the bulk matrix (inspector flow)', () => {
    expect(getValidTransitions(AppointmentStatus.SCHEDULED, 'OP')).not.toContain(
      AppointmentStatus.DONE,
    );
  });
});

describe('getValidTransitions — DONE', () => {
  it('AM can reopen to DRAFT', () => {
    expect(getValidTransitions(AppointmentStatus.DONE, 'AM')).toEqual([AppointmentStatus.DRAFT]);
  });

  it('OP cannot reopen', () => {
    expect(getValidTransitions(AppointmentStatus.DONE, 'OP')).toEqual([]);
  });

  it('CL_ADMIN cannot reopen', () => {
    expect(getValidTransitions(AppointmentStatus.DONE, 'CL_ADMIN')).toEqual([]);
  });
});

describe('getValidTransitions — CANCELLED / REJECTED', () => {
  it('OP/AM can revive both back to DRAFT', () => {
    expect(getValidTransitions(AppointmentStatus.CANCELLED, 'OP')).toEqual([
      AppointmentStatus.DRAFT,
    ]);
    expect(getValidTransitions(AppointmentStatus.CANCELLED, 'AM')).toEqual([
      AppointmentStatus.DRAFT,
    ]);
    expect(getValidTransitions(AppointmentStatus.REJECTED, 'OP')).toEqual([
      AppointmentStatus.DRAFT,
    ]);
    expect(getValidTransitions(AppointmentStatus.REJECTED, 'AM')).toEqual([
      AppointmentStatus.DRAFT,
    ]);
  });

  it('CL_ADMIN/CL_USER cannot revive terminal-non-failure rows', () => {
    expect(getValidTransitions(AppointmentStatus.CANCELLED, 'CL_ADMIN')).toEqual([]);
    expect(getValidTransitions(AppointmentStatus.REJECTED, 'CL_ADMIN')).toEqual([]);
    expect(getValidTransitions(AppointmentStatus.CANCELLED, 'CL_USER')).toEqual([]);
  });
});

describe('isReasonRequired', () => {
  it.each([
    [AppointmentStatus.DRAFT, AppointmentStatus.AWAITING_INSPECTOR, false],
    [AppointmentStatus.DRAFT, AppointmentStatus.REJECTED, true],
    [AppointmentStatus.DRAFT, AppointmentStatus.CANCELLED, true],
    [AppointmentStatus.AWAITING_INSPECTOR, AppointmentStatus.CANCELLED, true],
    [AppointmentStatus.SCHEDULED, AppointmentStatus.CANCELLED, true],
    [AppointmentStatus.SCHEDULED, AppointmentStatus.REJECTED, true],
    [AppointmentStatus.DONE, AppointmentStatus.DRAFT, true],
    [AppointmentStatus.CANCELLED, AppointmentStatus.DRAFT, true],
    [AppointmentStatus.REJECTED, AppointmentStatus.DRAFT, true],
  ])('%s → %s reasonRequired=%s', (from, to, expected) => {
    expect(isReasonRequired(from, to)).toBe(expected);
  });

  it('returns false for transitions not in the matrix', () => {
    // DRAFT → DONE is not a valid transition; reason is moot.
    expect(isReasonRequired(AppointmentStatus.DRAFT, AppointmentStatus.DONE)).toBe(false);
  });
});

describe('isTransitionDefined', () => {
  it('returns true for matrix-defined transitions regardless of role', () => {
    expect(
      isTransitionDefined(AppointmentStatus.DRAFT, AppointmentStatus.AWAITING_INSPECTOR),
    ).toBe(true);
    expect(isTransitionDefined(AppointmentStatus.DONE, AppointmentStatus.DRAFT)).toBe(true);
  });

  it('returns false for impossible transitions', () => {
    expect(isTransitionDefined(AppointmentStatus.DRAFT, AppointmentStatus.DONE)).toBe(false);
    expect(isTransitionDefined(AppointmentStatus.DONE, AppointmentStatus.AWAITING_INSPECTOR)).toBe(
      false,
    );
  });
});
