import type { ExecutionPhase } from '../types';

const VALID_TRANSITIONS: Record<ExecutionPhase, ExecutionPhase[]> = {
  PRE_START: ['IN_PROGRESS'],
  IN_PROGRESS: ['FINISHING'],
  FINISHING: ['SUBMITTING'],
  SUBMITTING: ['DONE', 'ERROR'],
  DONE: [],
  ERROR: ['SUBMITTING'],
};

export function canTransition(from: ExecutionPhase, to: ExecutionPhase): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function getNextPhases(phase: ExecutionPhase): ExecutionPhase[] {
  return VALID_TRANSITIONS[phase];
}
