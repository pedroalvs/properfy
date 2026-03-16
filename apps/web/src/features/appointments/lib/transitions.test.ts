import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@properfy/shared';
import { getAvailableTransitions } from './transitions';

describe('getAvailableTransitions', () => {
  it('AM from DRAFT sees 3 transitions (AWAITING_INSPECTOR, REJECTED, CANCELLED)', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DRAFT, 'AM');
    expect(transitions).toHaveLength(3);
    expect(transitions.map((t) => t.targetStatus)).toEqual([
      AppointmentStatus.AWAITING_INSPECTOR,
      AppointmentStatus.REJECTED,
      AppointmentStatus.CANCELLED,
    ]);
  });

  it('AM from SCHEDULED sees 3 transitions (DONE, CANCELLED, REJECTED)', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'AM');
    expect(transitions).toHaveLength(3);
    expect(transitions.map((t) => t.targetStatus)).toEqual([
      AppointmentStatus.DONE,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.REJECTED,
    ]);
  });

  it('AM from DONE sees 1 transition (DRAFT/reopen)', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DONE, 'AM');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.targetStatus).toBe(AppointmentStatus.DRAFT);
    expect(transitions[0]!.label).toBe('Reabrir como Rascunho');
    expect(transitions[0]!.requiresReason).toBe(true);
  });

  it('OP from DONE sees no transitions (reopen restricted to AM)', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.DONE, 'OP');
    expect(transitions).toHaveLength(0);
  });

  it('OP from SCHEDULED sees 3 transitions', () => {
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

  it('CANCELLED transitions require reason, DONE does not', () => {
    const transitions = getAvailableTransitions(AppointmentStatus.SCHEDULED, 'AM');
    const cancelled = transitions.find((t) => t.targetStatus === AppointmentStatus.CANCELLED);
    const done = transitions.find((t) => t.targetStatus === AppointmentStatus.DONE);
    expect(cancelled?.requiresReason).toBe(true);
    expect(done?.requiresReason).toBe(false);
  });
});
