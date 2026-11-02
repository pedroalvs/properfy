import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupAuth, mockMeEndpoint, AM_USER } from './helpers';

const DEFAULT_VALUE = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

const ROUTE_WEIGHTS = { travel: 1, windowWait: 1, baseProximity: 1 };

async function mockRouteWeights(page: Page) {
  // The page now also renders the Route planning section; keep it loading cleanly.
  await page.route('**/v1/platform-settings/routeWeights', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          key: 'routeWeights',
          section: 'Route planning',
          value: ROUTE_WEIGHTS,
          defaults: ROUTE_WEIGHTS,
          isDefault: true,
          updatedAt: null,
          updatedBy: null,
        },
      }),
    });
  });
}

async function mockPlatformSetting(page: Page) {
  let value = { ...DEFAULT_VALUE };
  await page.route('**/v1/platform-settings/fieldEvents', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as { value: typeof DEFAULT_VALUE };
      value = { ...body.value };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          key: 'fieldEvents',
          section: 'Field events',
          value,
          defaults: DEFAULT_VALUE,
          isDefault: method === 'PUT' ? false : JSON.stringify(value) === JSON.stringify(DEFAULT_VALUE),
          updatedAt: method === 'PUT' ? '2026-04-20T10:00:00Z' : null,
          updatedBy: method === 'PUT' ? { id: AM_USER.id, name: AM_USER.name } : null,
        },
      }),
    });
  });
}

test.describe('Platform settings — Field events (03.A2 web)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, AM_USER);
    await mockPlatformSetting(page);
    await mockRouteWeights(page);
  });

  test('AM edits the radius and mode, saves, and the values persist on reload', async ({ page }) => {
    await page.goto('/platform-settings');

    const radius = page.getByLabel('Geofence radius');
    await expect(radius).toHaveValue('300');

    await radius.fill('250');
    await page.getByLabel('Block').check();
    // The page now has two settings sections; scope Save to the Field events card.
    const fieldEventsCard = page
      .locator('div.rounded.bg-card-bg')
      .filter({ has: page.getByRole('heading', { name: 'Field events' }) });
    await fieldEventsCard.getByRole('button', { name: 'Save changes' }).click();

    // Reload reads the persisted value from the (stateful) stub.
    await page.reload();
    await expect(page.getByLabel('Geofence radius')).toHaveValue('250');
    await expect(page.getByLabel('Block')).toBeChecked();
    await expect(page.getByText(/There is no per-job override/)).toBeVisible();
  });
});
