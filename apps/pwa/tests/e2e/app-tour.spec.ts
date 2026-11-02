import { test, expect, type Page } from '@playwright/test';
import { API, stubJson } from './support/api';
import { loginAsInspector } from './support/auth';
import { INSPECTOR_ME, INSPECTOR_PROFILE_TOUR_PENDING, INSPECTOR_PROFILE_TOUR_DONE } from './support/fixtures';
import { skipOnWide } from './support/projects';
import { emulateStandalone } from './support/standalone';

/**
 * 00.A1 — the app tour, proven end-to-end (E1–E6). The tour anchors are
 * phone-layout elements, so these specs run on the two phone projects only
 * (L-X03-07); the wide projects report them skipped with the reason below.
 */
const PHONE_ONLY = 'tour targets are phone-layout anchors';

/** Override the profile read registered by the baseline (last route wins). */
function overrideMe(page: Page, profile: unknown) {
  return stubJson(page, '/v1/inspectors/me', { data: profile });
}

/**
 * Capture the completion POSTs. The app-state heartbeat also posts here (without
 * `onboardingCompleted`), so only those carrying `onboardingCompleted: true` count.
 */
async function captureCompletions(page: Page): Promise<Array<Record<string, unknown>>> {
  const completions: Array<Record<string, unknown>> = [];
  await page.route(
    (url) => url.origin === API && url.pathname === '/v1/inspectors/me/app-state',
    (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      if (body && body.onboardingCompleted === true) completions.push(body);
      return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
    },
  );
  return completions;
}

async function advanceToEnd(page: Page, nextClicks: number) {
  for (let i = 0; i < nextClicks; i++) {
    await page.getByRole('button', { name: 'Next' }).click();
  }
}

test.describe('App tour (00.A1)', () => {
  test('E1: first access shows the tour at step 1 of 9', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_PENDING);
    await captureCompletions(page);

    await page.goto('/today');
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await expect(page.getByText('Step 1 of 9')).toBeVisible();
    await expect(page.getByTestId('tour-overlay')).toBeVisible();
  });

  test('E2: skip records completion exactly once', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_PENDING);
    const completions = await captureCompletions(page);

    await page.goto('/today');
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => completions.length).toBe(1);
    expect(completions[0]).toMatchObject({ onboardingCompleted: true });
  });

  test('E3: completing every step records completion once', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_PENDING);
    const completions = await captureCompletions(page);

    await page.goto('/today');
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await advanceToEnd(page, 8);
    await expect(page.getByText('Step 9 of 9')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => completions.length).toBe(1);
  });

  test('E4: does not reappear after completion, including on a fresh load', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_PENDING);
    const completions = await captureCompletions(page);

    await page.goto('/today');
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect.poll(() => completions.length).toBe(1);

    // The server now reports onboarding complete. A full reload resets the app's
    // in-memory once-per-load guard (so this proves the server flag, i.e. "another
    // device"), and the tour must not auto-open again.
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_DONE);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('E5: "Show app tour" replays without recording state', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_DONE);
    const completions = await captureCompletions(page);

    await page.goto('/profile/settings');
    await page.getByRole('button', { name: 'Show app tour' }).click();
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(completions).toHaveLength(0);
  });

  test('E6a: the install step is the last step in a browser (9 total)', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_PENDING);
    await captureCompletions(page);

    await page.goto('/today');
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await advanceToEnd(page, 8);
    await expect(page.getByRole('dialog', { name: 'Install Properfy' })).toBeVisible();
    await expect(page.getByText('Step 9 of 9')).toBeVisible();
  });

  test('E6b: the install step is absent in standalone (8 total)', async ({ page }) => {
    skipOnWide(PHONE_ONLY);
    await emulateStandalone(page);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_PENDING);
    await captureCompletions(page);

    await page.goto('/today');
    await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible();
    await advanceToEnd(page, 7);
    await expect(page.getByText('Step 8 of 8')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Install Properfy' })).toHaveCount(0);
  });
});
