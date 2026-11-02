/**
 * Per-user local record that the tour's completion POST is pending (sent on
 * finish/skip but not yet confirmed). It exists only to (a) stop the tour
 * re-opening after a failed completion signal and (b) drive a retry. The value is
 * the `userId`, so a different user on a shared device is not affected. Every
 * access is guarded — a throwing/blocked `localStorage` degrades to "not pending".
 *
 * NOTE: the same key string is inlined in `lib/auth-storage.ts` (cleared on
 * logout) to avoid an import cycle; keep the two in sync.
 */

export const TOUR_PENDING_KEY = 'properfy.pwa.tourCompletedPending';

export type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isTourPendingFor(storage: PendingStorage | undefined, userId: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(TOUR_PENDING_KEY) === userId;
  } catch {
    return false;
  }
}

export function setTourPending(storage: PendingStorage | undefined, userId: string): void {
  if (!storage) return;
  try {
    storage.setItem(TOUR_PENDING_KEY, userId);
  } catch {
    /* storage unavailable — tolerated; the module-level open guard still applies */
  }
}

export function clearTourPending(storage: PendingStorage | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(TOUR_PENDING_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
