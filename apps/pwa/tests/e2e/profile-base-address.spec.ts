import { test, expect } from '@playwright/test';
import { API } from './support/api';
import { loginAsInspector } from './support/auth';

/**
 * V-3: the inspector's base address is validated on save. An unverifiable address
 * is rejected with a 422 ADDRESS_NOT_VERIFIED and the card shows the per-reason
 * error block (no "Saved, but…" state). Saving needs the server + Mapbox, so the
 * card refuses to save offline with a dedicated message. Both states are
 * layout-agnostic, so they run on every project (Chromium + WebKit).
 */
test.describe('Profile base address — on-save validation (V-3)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsInspector(page);
  });

  test('shows the per-reason error block when the base address is unverifiable (422)', async ({
    page,
  }) => {
    // Method-aware override: PATCH /me rejects with 422; GET /me still falls back to
    // the baseline located base (stubJson matches by pathname, not method).
    await page.route(
      (url) => url.origin === API && url.pathname === '/v1/inspectors/me',
      (route) => {
        if (route.request().method() === 'PATCH') {
          return route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'ADDRESS_NOT_VERIFIED',
                message: 'The address could not be verified.',
                details: [{ field: 'address', reason: 'COARSE_RESULT' }],
              },
            }),
          });
        }
        return route.fallback();
      },
    );

    await page.goto('/profile/account');
    const card = page.getByTestId('base-address-card');
    await expect(card).toBeVisible();

    // Make the form dirty so the Save button appears, then submit.
    await card.getByLabel('Suburb').fill('Kurrajong');
    const save = card.getByRole('button', { name: /save address/i });
    await expect(save).toBeEnabled();
    await save.click();

    const alert = card.getByRole('alert');
    await expect(alert).toContainText('We could only locate the area, not the exact address.');
    await expect(alert).toContainText('Add the street number, or correct the street name.');
  });

  test('blocks saving offline with a dedicated message and a disabled button', async ({ page }) => {
    await page.goto('/profile/account');
    const card = page.getByTestId('base-address-card');
    await expect(card).toBeVisible();

    await card.getByLabel('Suburb').fill('Kurrajong'); // dirty → Save button appears
    await page.context().setOffline(true);

    await expect(card.getByText("You're offline. Connect to save this address.")).toBeVisible();
    await expect(card.getByRole('button', { name: /save address/i })).toBeDisabled();

    // Restore connectivity so nothing leaks into teardown / the next test.
    await page.context().setOffline(false);
  });
});
