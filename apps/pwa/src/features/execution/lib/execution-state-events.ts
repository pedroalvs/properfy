/**
 * Cross-instance notifier for the local execution state.
 *
 * `useLocalExecutionState` restores a row from IndexedDB once per mount and then
 * keeps it in React state. When an *external* code path mutates that row — the
 * offline queue clearing a permanently-failed check-in (F03 / L-F03-02), or
 * `purgeAppointmentFromOfflineQueue` after a "Can't do this job" — a card that is
 * already mounted holds a stale copy and would keep showing "Check out". This
 * keyed emitter lets those external mutators tell every mounted hook for that
 * appointment to re-read from IndexedDB.
 *
 * Only external mutators emit. A hook's own `updateState`/`clearState` already
 * update its React state directly and must NOT emit, which avoids self-write
 * read races and a transient flicker on the normal finish path.
 */

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

/** Subscribe to external changes for one appointment's execution state. */
export function subscribeExecutionStateChange(appointmentId: string, listener: Listener): () => void {
  let set = listeners.get(appointmentId);
  if (!set) {
    set = new Set();
    listeners.set(appointmentId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(appointmentId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(appointmentId);
  };
}

/** Notify every subscriber that an appointment's execution state changed externally. */
export function emitExecutionStateChange(appointmentId: string): void {
  listeners.get(appointmentId)?.forEach((listener) => listener());
}
