import { test, expect, type Page } from '@playwright/test';
import { API, stubJson } from './support/api';
import { loginAsInspector } from './support/auth';
import { seedExecutionState } from './support/idb';
import { isWebKitProject } from './support/projects';
import { APPOINTMENT_DETAIL, APPOINTMENT_ID, FINISH_RESULT } from './support/fixtures';

interface SetupOptions {
  scheduledDate: string;
  withInspectionAppLink: boolean;
}

interface SetupResult {
  finishCalls: () => number;
}

async function setupExecutionAtFinishing(
  page: Page,
  { scheduledDate, withInspectionAppLink }: SetupOptions,
): Promise<SetupResult> {
  let finishCallCount = 0;

  // Geolocation is mocked via addInitScript (the correct pattern — it is deterministic
  // and runs before app code on every navigation).
  await page.addInitScript(() => {
    const position = {
      coords: { latitude: -33.8688, longitude: 151.2093, accuracy: 5 },
      timestamp: Date.now(),
    };
    navigator.geolocation.getCurrentPosition = (success) => {
      setTimeout(() => success(position as GeolocationPosition), 50);
    };
    navigator.geolocation.watchPosition = (success) => {
      setTimeout(() => success(position as GeolocationPosition), 50);
      return 1;
    };
  });

  // Seed the FINISHING execution state in IndexedDB FIRST, before any tokens exist.
  // seedExecutionState opens a document on the public /login route; seeding before
  // loginAsInspector keeps that load unauthenticated, so it never tries to redirect
  // (an authenticated /login would race the later goto('/execution') on WebKit).
  // IndexedDB is per-origin and persists to the /execution navigation below.
  await seedExecutionState(page, {
    appointmentId: APPOINTMENT_ID,
    phase: 'FINISHING',
    pendingSync: false,
    startLocation: {
      latitude: -33.8688,
      longitude: 151.2093,
      accuracy: 5,
      capturedAt: '2026-07-20T09:05:00.000Z',
    },
    finishLocation: null,
    startedAt: '2026-07-20T09:05:00.000Z',
    errorMessage: null,
    lastSavedAt: null,
  });

  // Tokens (addInitScript) + blockUnmockedApi + baseline /v1/me (replaces the old
  // goto+evaluate token write and the forbidden catch-all route).
  await loginAsInspector(page);

  // Appointment detail for this appointment, with the Sydney scheduled date and the
  // optional inspection-app link that drives the sync-confirmation modal.
  await stubJson(page, `/v1/inspector/appointments/${APPOINTMENT_ID}`, {
    data: {
      ...APPOINTMENT_DETAIL,
      scheduledDate,
      jobDetails: {
        ...APPOINTMENT_DETAIL.jobDetails,
        ...(withInspectionAppLink
          ? { inspectionAppLink: { url: 'https://inspection.example.com', label: 'Inspection App' } }
          : {}),
      },
    },
  });

  // Finish route — counts calls so specs can assert whether a submit fired.
  await page.route(
    (url) => url.origin === API && url.pathname === `/v1/inspector/appointments/${APPOINTMENT_ID}/finish`,
    (route) => {
      finishCallCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: FINISH_RESULT }),
      });
    },
  );

  await page.goto(`/execution/${APPOINTMENT_ID}`);
  await expect(page.getByTestId('submit-button')).toBeVisible();

  return { finishCalls: () => finishCallCount };
}

test.describe('Execution finish confirmations', () => {
  // WebKit-only residual (L-X03-03): a cold deep-link to /execution during session
  // restore is flaky on WebKit — the SPA bounces through /login and intermittently
  // falls back to /schedule instead of recovering to /execution, so submit-button
  // never appears. Chromium resolves /v1/me before the first guard paint and never
  // bounces, so these finish-confirmation flows are fully covered there. Deferred
  // (not silently skipped) with a tracked issue; the app-side fix (WebKit deep-link
  // redirect-target preservation) is its own task and does not block F04-3b.
  // Tracked: https://github.com/pedroalvs/properfy/issues/1313
  test.beforeEach(({}, testInfo) => {
    test.fixme(
      isWebKitProject(testInfo),
      'WebKit cold deep-link to /execution flakes during session restore — https://github.com/pedroalvs/properfy/issues/1313 (covered on Chromium)',
    );
  });

  test('declining sync keeps the inspection in finishing and guides the inspector', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2099-12-31',
      withInspectionAppLink: true,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('sync-confirm-modal')).toBeVisible();

    await page.getByTestId('sync-confirm-no').click();
    await expect(page.getByTestId('sync-confirm-modal')).not.toBeVisible();
    await expect(
      page.getByText('Sync the inspection in the Inspection App before completing.'),
    ).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
    expect(finishCalls()).toBe(0);
  });

  test('sync confirmation chains into the past-time warning and completes', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2020-01-01',
      withInspectionAppLink: true,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('sync-confirm-modal')).toBeVisible();

    await page.getByTestId('sync-confirm-yes').click();
    await expect(page.getByTestId('past-time-confirm-modal')).toBeVisible();
    expect(finishCalls()).toBe(0);

    await page.getByTestId('past-time-confirm').click();
    await expect(page.getByText('Inspection Complete')).toBeVisible();
    expect(finishCalls()).toBe(1);
  });

  test('cancelling the past-time warning does not submit', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2020-01-01',
      withInspectionAppLink: false,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('past-time-confirm-modal')).toBeVisible();

    await page.getByTestId('past-time-cancel').click();
    await expect(page.getByTestId('past-time-confirm-modal')).not.toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
    expect(finishCalls()).toBe(0);
  });

  test('completes directly when no confirmation applies', async ({ page }) => {
    const { finishCalls } = await setupExecutionAtFinishing(page, {
      scheduledDate: '2099-12-31',
      withInspectionAppLink: false,
    });

    await page.getByTestId('submit-button').click();
    await expect(page.getByText('Inspection Complete')).toBeVisible();
    expect(finishCalls()).toBe(1);
  });
});
