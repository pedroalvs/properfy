import { canTransition, getNextPhases } from '../execution-state-machine';
import type { ExecutionPhase } from '../../types';

describe('execution-state-machine', () => {
  describe('canTransition', () => {
    it('allows PRE_START → IN_PROGRESS', () => {
      expect(canTransition('PRE_START', 'IN_PROGRESS')).toBe(true);
    });

    it('allows IN_PROGRESS → FINISHING', () => {
      expect(canTransition('IN_PROGRESS', 'FINISHING')).toBe(true);
    });

    it('allows FINISHING → SUBMITTING', () => {
      expect(canTransition('FINISHING', 'SUBMITTING')).toBe(true);
    });

    it('allows SUBMITTING → DONE', () => {
      expect(canTransition('SUBMITTING', 'DONE')).toBe(true);
    });

    it('allows SUBMITTING → ERROR', () => {
      expect(canTransition('SUBMITTING', 'ERROR')).toBe(true);
    });

    it('allows ERROR → SUBMITTING (retry)', () => {
      expect(canTransition('ERROR', 'SUBMITTING')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(canTransition('PRE_START', 'DONE')).toBe(false);
      expect(canTransition('DONE', 'PRE_START')).toBe(false);
      expect(canTransition('IN_PROGRESS', 'PRE_START')).toBe(false);
      expect(canTransition('FINISHING', 'IN_PROGRESS')).toBe(false);
    });

    it('rejects transitions from DONE', () => {
      const phases: ExecutionPhase[] = ['PRE_START', 'IN_PROGRESS', 'FINISHING', 'SUBMITTING', 'ERROR'];
      phases.forEach((phase) => {
        expect(canTransition('DONE', phase)).toBe(false);
      });
    });
  });

  describe('getNextPhases', () => {
    it('returns valid next phases for PRE_START', () => {
      expect(getNextPhases('PRE_START')).toEqual(['IN_PROGRESS']);
    });

    it('returns empty array for DONE', () => {
      expect(getNextPhases('DONE')).toEqual([]);
    });

    it('returns two options for SUBMITTING', () => {
      expect(getNextPhases('SUBMITTING')).toEqual(['DONE', 'ERROR']);
    });
  });
});
