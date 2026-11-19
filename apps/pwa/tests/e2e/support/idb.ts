import type { Page } from '@playwright/test';

/**
 * One row of the PWA's `execution-states` IndexedDB store (see
 * `features/execution/lib/indexeddb.ts`). Kept permissive — the spec supplies the
 * exact shape the app reads.
 */
export interface ExecutionSeedState {
  appointmentId: string;
  phase: 'FINISHING' | 'STARTING' | 'IDLE' | string;
  pendingSync: boolean;
  startLocation: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
  } | null;
  finishLocation: unknown | null;
  startedAt: string | null;
  errorMessage: string | null;
  lastSavedAt: string | null;
}

/**
 * Seed one `execution-states` row BEFORE navigating to `/execution/:id`.
 *
 * Done via an AWAITED `openDB` inside `evaluate` on the public `/login` route.
 * NEVER seed IndexedDB in `addInitScript`: that races the app's own `openDB`
 * (`indexeddb.ts`) and makes `submit-button` intermittently vanish, worst on WebKit
 * (L-X03-06).
 *
 * Call this BEFORE `loginAsInspector` (i.e. before tokens are seeded via
 * `addInitScript`): the `/login` load used for seeding then stays unauthenticated
 * and settles cleanly, instead of an authenticated `/login` redirecting and racing
 * the later `goto('/execution/:id')` on WebKit. IndexedDB is per-origin, so the
 * seeded row persists to the execution navigation. Order:
 * `seedExecutionState(page, state)` → `loginAsInspector(page)` → stubs →
 * `page.goto('/execution/:id')`.
 */
export async function seedExecutionState(page: Page, state: ExecutionSeedState): Promise<void> {
  await page.goto('/login');
  await page.evaluate(async (seed) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('properfy-pwa', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('execution-states')) db.createObjectStore('execution-states');
        if (!db.objectStoreNames.contains('queued-actions')) db.createObjectStore('queued-actions');
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('execution-states', 'readwrite');
        tx.objectStore('execution-states').put(seed, seed.appointmentId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, state);
}
