import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@properfy/shared';
import { getAvailableTransitions } from './transitions';

describe('getAvailableTransitions', () => {
  it('AM from DRAFT sees 2 transitions (REJECTED, CANCELLED) — release is OP/SYS only', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DRAFT, 'AM');
    expect(transitions).toHaveLength(2);
    expect(transitions.map((t) => t.targetStatus)).toEqual([
      AppointmentStatus.REJECTED,
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('AM from SCHEDULED sees 1 transition (CANCELLED) — done/reject are OP/SYS/INSP only', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'AM');
    expect(transitions).toHaveLength(1);
    expect(transitions.map((t) => t.targetStatus)).toEqual([AppointmentStatus.CANCELLED]);
  });

  it('AM from DONE sees 2 transitions (DRAFT/reopen and REJECTED)', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DONE, 'AM');
    expect(transitions).toHaveLength(2);
    expect(transitions[0]!.targetStatus).toBe(AppointmentStatus.DRAFT);
    expect(transitions[0]!.label).toBe('Reopen as Draft');
    expect(transitions[0]!.requiresReason).toBe(true);
    expect(transitions[1]!.targetStatus).toBe(AppointmentStatus.REJECTED);
  });

  it('OP from DONE sees REJECTED only (reopen restricted to AM)', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DONE, 'OP');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.targetStatus).toBe(AppointmentStatus.REJECTED);
  });

  it('OP from AWAITING_INSPECTOR sees SCHEDULED, CANCELLED, REJECTED', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.AWAITING_INSPECTOR, 'OP');
    expect(transitions).toHaveLength(3);
    expect(transitions.map((t) => t.targetStatus)).toEqual([
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.REJECTED,
    ]);
  });

  it('OP from SCHEDULED sees DONE, CANCELLED, REJECTED', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'OP');
    expect(transitions).toHaveLength(3);
    expect(transitions.map((t) => t.targetStatus)).toEqual([
      AppointmentStatus.DONE,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.REJECTED,
    ]);
  });

  it('CL_ADMIN from SCHEDULED sees only CANCELLED', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'CL_ADMIN');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.targetStatus).toBe(AppointmentStatus.CANCELLED);
  });

  it('CL_ADMIN from DONE sees nothing', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DONE, 'CL_ADMIN');
    expect(transitions).toHaveLength(0);
  });

  it('INSP from SCHEDULED sees only DONE', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'INSP');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.targetStatus).toBe(AppointmentStatus.DONE);
  });

  it('INSP from DRAFT sees nothing', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DRAFT, 'INSP');
    expect(transitions).toHaveLength(0);
  });

  it('CANCELLED transitions require reason in the OP action bar', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'OP');
    const cancelled = transitions.find((t) => t.targetStatus === AppointmentStatus.CANCELLED);
    expect(cancelled?.requiresReason).toBe(true);
  });
});
