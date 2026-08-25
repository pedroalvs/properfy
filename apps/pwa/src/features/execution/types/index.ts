export type ExecutionPhase =
  | 'PRE_START'
  | 'IN_PROGRESS'
  | 'FINISHING'
  | 'SUBMITTING'
  | 'DONE'
  | 'ERROR';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export interface ExecutionState {
  appointmentId: string;
  phase: ExecutionPhase;
  pendingSync: boolean;
  startLocation: CapturedLocation | null;
  finishLocation: CapturedLocation | null;
  startedAt: string | null;
  errorMessage: string | null;
  lastSavedAt: string | null;
}
