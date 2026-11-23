import { test, expect, type Page } from '@playwright/test';
import { stubJson } from './support/api';
import { loginAsInspector } from './support/auth';
import { INSPECTOR_ME, INSPECTOR_PROFILE_TOUR_DONE } from './support/fixtures';

/**
 * Push-default feature (R3) — the top-bar "notifications off" indicator and the
 * enable modal, proven end-to-end. Push can't actually be subscribed in E2E
 * (serviceWorkers are blocked), so we force the push capabilities + a denied OS
 * permission before boot. That resolves the app deterministically to a disabled
 * push state on BOTH Chromium and WebKit, which is exactly when the indicator must
 * appear — without depending on a real subscription. The subscribe/opt-out paths
 * are covered by the Vitest suites.
 */
async function forcePushDisabled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Ensure the PushManager capability probe passes on every browser.
    if (!('PushManager' in window)) {
      Object.defineProperty(window, 'PushManager', { value: function () {}, configurable: true });
    }
    // Replace Notification with a stub reporting a denied permission so the app
    // resolves to a disabled push state regardless of the harness default.
    const stub = function () {} as unknown as { permission: NotificationPermission };
    Object.defineProperty(stub, 'permission', { get: () => 'denied', configurable: true });
    try {
      Object.defineProperty(window, 'Notification', { value: stub, configurable: true });
    } catch {
      /* leave the native Notification in place */
    }
  });
}

function overrideMe(page: Page, profile: unknown) {
  return stubJson(page, '/v1/inspectors/me', { data: profile });
}

test.describe('Push default — indicator and enable modal (R3)', () => {
  test('shows the "notifications off" indicator and opens the enable modal', async ({ page }) => {
    await forcePushDisabled(page);
    await loginAsInspector(page, { me: INSPECTOR_ME });
    // A completed tour so the coach overlay does not block the top bar.
    await overrideMe(page, INSPECTOR_PROFILE_TOUR_DONE);

    await page.goto('/schedule');

    const indicator = page.getByTestId('push-status-indicator');
    await expect(indicator).toBeVisible();

    await indicator.click();
    await expect(page.getByTestId('enable-push-modal')).toBeVisible();
    await expect(page.getByText('Turn on notifications?')).toBeVisible();
  });
});
