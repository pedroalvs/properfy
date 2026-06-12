import { describe, it, expect } from 'vitest';
import {
  AppointmentStateMachine,
  TRANSITION_RULES,
} from '../../../src/modules/appointment/domain/appointment-state-machine';
import type { AppointmentStatus, UserRole } from '@properfy/shared';

const machine = new AppointmentStateMachine();

describe('AppointmentStateMachine', () => {
  describe('TRANSITION_RULES count', () => {
    it('defines exactly 14 transition rules', () => {
      expect(TRANSITION_RULES).toHaveLength(14);
    });
  });

  describe('getTransitionRule()', () => {
    it('returns the rule for a valid transition', () => {
      const rule = machine.getTransitionRule('DRAFT', 'AWAITING_INSPECTOR');
      expect(rule).not.toBeNull();
      expect(rule?.from).toBe('DRAFT');
      expect(rule?.to).toBe('AWAITING_INSPECTOR');
    });

    it('returns null for an invalid transition', () => {
      expect(machine.getTransitionRule('DONE', 'AWAITING_INSPECTOR')).toBeNull();
      expect(machine.getTransitionRule('DRAFT', 'DONE')).toBeNull();
      expect(machine.getTransitionRule('CANCELLED', 'DONE')).toBeNull();
    });
  });

  describe('validateTransition() — transitions valid for AM actor', () => {
    const validForAM: [AppointmentStatus, AppointmentStatus][] = [
      ['DRAFT', 'REJECTED'],
      ['DRAFT', 'CANCELLED'],
      ['AWAITING_INSPECTOR', 'SCHEDULED'],
      ['AWAITING_INSPECTOR', 'CANCELLED'],
      ['AWAITING_INSPECTOR', 'REJECTED'],
      ['SCHEDULED', 'CANCELLED'],
      ['SCHEDULED', 'REJECTED'],
      ['REJECTED', 'DRAFT'],
      ['REJECTED', 'AWAITING_INSPECTOR'],
      ['CANCELLED', 'DRAFT'],
      ['DONE', 'DRAFT'],
      ['DONE', 'REJECTED'],
    ];

    for (const [from, to] of validForAM) {
      it(`${from} → ${to} is valid for AM`, () => {
        const result = machine.validateTransition(from, to, 'AM');
        expect(result.valid).toBe(true);
        expect(result.rule).not.toBeNull();
        expect(result.error).toBeUndefined();
      });
    }

    const invalidForAM: [AppointmentStatus, AppointmentStatus][] = [
      ['DRAFT', 'AWAITING_INSPECTOR'],
      ['SCHEDULED', 'DONE'],
    ];

    for (const [from, to] of invalidForAM) {
      it(`${from} → ${to} is NOT valid for AM`, () => {
        const result = machine.validateTransition(from, to, 'AM');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not permitted');
      });
    }
  });

  describe('validateTransition() — RBAC: SYS role', () => {
    it('SYS can do DRAFT → AWAITING_INSPECTOR', () => {
      expect(machine.validateTransition('DRAFT', 'AWAITING_INSPECTOR', 'SYS').valid).toBe(true);
    });

    it('SYS can do AWAITING_INSPECTOR → SCHEDULED', () => {
      expect(machine.validateTransition('AWAITING_INSPECTOR', 'SCHEDULED', 'SYS').valid).toBe(true);
    });

    it('SYS can do SCHEDULED → REJECTED', () => {
      expect(machine.validateTransition('SCHEDULED', 'REJECTED', 'SYS').valid).toBe(true);
    });

    it('SYS cannot do SCHEDULED → DONE', () => {
      expect(machine.validateTransition('SCHEDULED', 'DONE', 'SYS').valid).toBe(false);
    });
  });

  describe('validateTransition() — RBAC: OP role', () => {
    it('OP can do DRAFT → AWAITING_INSPECTOR', () => {
      expect(machine.validateTransition('DRAFT', 'AWAITING_INSPECTOR', 'OP').valid).toBe(true);
    });

    it('OP can do SCHEDULED → DONE', () => {
      expect(machine.validateTransition('SCHEDULED', 'DONE', 'OP').valid).toBe(true);
    });

    it('OP cannot do DONE → DRAFT', () => {
      const result = machine.validateTransition('DONE', 'DRAFT', 'OP');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not permitted');
    });

    it('OP cannot do DONE → REJECTED', () => {
      const result = machine.validateTransition('DONE', 'REJECTED', 'OP');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not permitted');
    });

    it('OP can do REJECTED → DRAFT', () => {
      expect(machine.validateTransition('REJECTED', 'DRAFT', 'OP').valid).toBe(true);
    });

    it('OP can do CANCELLED → DRAFT', () => {
      expect(machine.validateTransition('CANCELLED', 'DRAFT', 'OP').valid).toBe(true);
    });
  });

  describe('validateTransition() — RBAC: CL_ADMIN role', () => {
    it('CL_ADMIN can cancel from DRAFT', () => {
      expect(machine.validateTransition('DRAFT', 'CANCELLED', 'CL_ADMIN').valid).toBe(true);
    });

    it('CL_ADMIN can cancel from AWAITING_INSPECTOR', () => {
      expect(machine.validateTransition('AWAITING_INSPECTOR', 'CANCELLED', 'CL_ADMIN').valid).toBe(
        true,
      );
    });

    it('CL_ADMIN can cancel from SCHEDULED', () => {
      expect(machine.validateTransition('SCHEDULED', 'CANCELLED', 'CL_ADMIN').valid).toBe(true);
    });

    it('CL_ADMIN cannot do DRAFT → AWAITING_INSPECTOR', () => {
      const result = machine.validateTransition('DRAFT', 'AWAITING_INSPECTOR', 'CL_ADMIN');
      expect(result.valid).toBe(false);
    });

    it('CL_ADMIN cannot do SCHEDULED → DONE', () => {
      const result = machine.validateTransition('SCHEDULED', 'DONE', 'CL_ADMIN');
      expect(result.valid).toBe(false);
    });

    it('CL_ADMIN cannot do CANCELLED → DRAFT', () => {
      const result = machine.validateTransition('CANCELLED', 'DRAFT', 'CL_ADMIN');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTransition() — RBAC: CL_USER role', () => {
    it('CL_USER can cancel from DRAFT', () => {
      expect(machine.validateTransition('DRAFT', 'CANCELLED', 'CL_USER').valid).toBe(true);
    });

    it('CL_USER can cancel from AWAITING_INSPECTOR', () => {
      expect(
        machine.validateTransition('AWAITING_INSPECTOR', 'CANCELLED', 'CL_USER').valid,
      ).toBe(true);
    });

    it('CL_USER can cancel from SCHEDULED', () => {
      expect(machine.validateTransition('SCHEDULED', 'CANCELLED', 'CL_USER').valid).toBe(true);
    });

    it('CL_USER cannot do DRAFT → AWAITING_INSPECTOR', () => {
      expect(machine.validateTransition('DRAFT', 'AWAITING_INSPECTOR', 'CL_USER').valid).toBe(
        false,
      );
    });

    it('CL_USER cannot do SCHEDULED → DONE', () => {
      expect(machine.validateTransition('SCHEDULED', 'DONE', 'CL_USER').valid).toBe(false);
    });
  });

  describe('validateTransition() — RBAC: INSP role', () => {
    it('INSP can do SCHEDULED → DONE', () => {
      expect(machine.validateTransition('SCHEDULED', 'DONE', 'INSP').valid).toBe(true);
    });

    it('INSP cannot do DRAFT → AWAITING_INSPECTOR', () => {
      expect(machine.validateTransition('DRAFT', 'AWAITING_INSPECTOR', 'INSP').valid).toBe(false);
    });

    it('INSP cannot do SCHEDULED → CANCELLED', () => {
      expect(machine.validateTransition('SCHEDULED', 'CANCELLED', 'INSP').valid).toBe(false);
    });

    it('INSP cannot do SCHEDULED → REJECTED', () => {
      expect(machine.validateTransition('SCHEDULED', 'REJECTED', 'INSP').valid).toBe(false);
    });
  });

  describe('requiresReason', () => {
    it('DRAFT → AWAITING_INSPECTOR does not require reason', () => {
      const rule = machine.getTransitionRule('DRAFT', 'AWAITING_INSPECTOR');
      expect(rule?.requiresReason).toBe(false);
    });

    it('DRAFT → REJECTED requires reason', () => {
      const rule = machine.getTransitionRule('DRAFT', 'REJECTED');
      expect(rule?.requiresReason).toBe(true);
    });

    it('DRAFT → CANCELLED requires reason', () => {
      const rule = machine.getTransitionRule('DRAFT', 'CANCELLED');
      expect(rule?.requiresReason).toBe(true);
    });

    it('AWAITING_INSPECTOR → SCHEDULED does not require reason', () => {
      const rule = machine.getTransitionRule('AWAITING_INSPECTOR', 'SCHEDULED');
      expect(rule?.requiresReason).toBe(false);
    });

    it('AWAITING_INSPECTOR → CANCELLED requires reason', () => {
      const rule = machine.getTransitionRule('AWAITING_INSPECTOR', 'CANCELLED');
      expect(rule?.requiresReason).toBe(true);
    });

    it('AWAITING_INSPECTOR → REJECTED requires reason', () => {
      const rule = machine.getTransitionRule('AWAITING_INSPECTOR', 'REJECTED');
      expect(rule?.requiresReason).toBe(true);
    });

    it('SCHEDULED → DONE does not require reason', () => {
      const rule = machine.getTransitionRule('SCHEDULED', 'DONE');
      expect(rule?.requiresReason).toBe(false);
    });

    it('SCHEDULED → CANCELLED requires reason', () => {
      const rule = machine.getTransitionRule('SCHEDULED', 'CANCELLED');
      expect(rule?.requiresReason).toBe(true);
    });

    it('SCHEDULED → REJECTED requires reason', () => {
      const rule = machine.getTransitionRule('SCHEDULED', 'REJECTED');
      expect(rule?.requiresReason).toBe(true);
    });

    it('REJECTED → DRAFT requires reason', () => {
      const rule = machine.getTransitionRule('REJECTED', 'DRAFT');
      expect(rule?.requiresReason).toBe(true);
    });

    it('REJECTED → AWAITING_INSPECTOR requires reason', () => {
      const rule = machine.getTransitionRule('REJECTED', 'AWAITING_INSPECTOR');
      expect(rule?.requiresReason).toBe(true);
    });

    it('CANCELLED → DRAFT requires reason', () => {
      const rule = machine.getTransitionRule('CANCELLED', 'DRAFT');
      expect(rule?.requiresReason).toBe(true);
    });

    it('DONE → DRAFT requires reason', () => {
      const rule = machine.getTransitionRule('DONE', 'DRAFT');
      expect(rule?.requiresReason).toBe(true);
    });

    it('DONE → REJECTED requires reason', () => {
      const rule = machine.getTransitionRule('DONE', 'REJECTED');
      expect(rule?.requiresReason).toBe(true);
    });
  });

  describe('requiresDoneCheckedBy', () => {
    it('SCHEDULED → DONE requires doneCheckedBy', () => {
      const rule = machine.getTransitionRule('SCHEDULED', 'DONE');
      expect(rule?.requiresDoneCheckedBy).toBe(true);
    });

    it('only SCHEDULED → DONE requires doneCheckedBy', () => {
      const otherTransitions = TRANSITION_RULES.filter(
        (r) => !(r.from === 'SCHEDULED' && r.to === 'DONE'),
      );
      for (const rule of otherTransitions) {
        expect(rule.requiresDoneCheckedBy).toBe(false);
      }
    });
  });

  describe('validateTransition() — invalid transition returns error message', () => {
    it('returns error message for completely invalid transition', () => {
      const result = machine.validateTransition('DONE', 'AWAITING_INSPECTOR', 'AM');
      expect(result.valid).toBe(false);
      expect(result.rule).toBeNull();
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('DONE');
      expect(result.error).toContain('AWAITING_INSPECTOR');
    });

    it('returns error message for forbidden role', () => {
      const result = machine.validateTransition('DONE', 'DRAFT', 'INSP');
      expect(result.valid).toBe(false);
      expect(result.rule).not.toBeNull();
      expect(result.error).toContain('INSP');
      expect(result.error).toContain('not permitted');
    });
  });
});
