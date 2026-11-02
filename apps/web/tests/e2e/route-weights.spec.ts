import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupAuth, mockMeEndpoint, AM_USER } from './helpers';

const FIELD_EVENTS = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

const DEFAULT_WEIGHTS = { travel: 1, windowWait: 1, baseProximity: 1 };

async function mockSettings(page: Page) {
  // Field events section loads cleanly (the page renders it too).
  await page.route('**/v1/platform-settings/fieldEvents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          key: 'fieldEvents',
          section: 'Field events',
          value: FIELD_EVENTS,
          defaults: FIELD_EVENTS,
          isDefault: true,
          updatedAt: null,
          updatedBy: null,
        },
      }),
    });
  });

  // Stateful route-weights stub.
  let weights = { ...DEFAULT_WEIGHTS };
  await page.route('**/v1/platform-settings/routeWeights', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as { value: typeof DEFAULT_WEIGHTS };
      weights = { ...body.value };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          key: 'routeWeights',
          section: 'Route planning',
          value: weights,
          defaults: DEFAULT_WEIGHTS,
          isDefault: method === 'PUT' ? false : JSON.stringify(weights) === JSON.stringify(DEFAULT_WEIGHTS),
          updatedAt: method === 'PUT' ? '2026-04-20T10:00:00Z' : null,
          updatedBy: method === 'PUT' ? { id: AM_USER.id, name: AM_USER.name } : null,
        },
      }),
    });
  });
}

async function mockInspectorSearch(page: Page) {
  await page.route('**/v1/inspectors?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 'insp-1', name: 'Inspector Smith' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }),
    });
  });
}

function previewStop(appointmentId: string, sequence: number, appointmentCode: string) {
  return {
    appointmentId,
    sequence,
    appointmentCode,
    suburb: 'Surry Hills',
    windowStart: '09:00',
    windowEnd: '11:00',
    timezone: 'Australia/Sydney',
    eta: '2026-11-04T22:05:00.000Z',
    lateS: 0,
  };
}

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

async function mockPreview(page: Page) {
  await page.route('**/v1/day-plans/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          // Saved weights keep A then B; the form's weights reorder to B then A.
          current: {
            weights: DEFAULT_WEIGHTS,
            etaSource: 'MATRIX',
            approximate: false,
            departureAt: '2026-11-04T21:50:00.000Z',
            finishEta: '2026-11-05T02:40:00.000Z',
            totals: { driveS: 4200, waitS: 900, lateS: 0 },
            feasible: true,
            stops: [previewStop(A, 1, 'INS-0042'), previewStop(B, 2, 'INS-0043')],
          },
          proposed: {
            weights: { travel: 1, windowWait: 0, baseProximity: 1 },
            etaSource: 'MATRIX',
            approximate: false,
            departureAt: '2026-11-04T21:50:00.000Z',
            finishEta: '2026-11-05T02:40:00.000Z',
            totals: { driveS: 3600, waitS: 0, lateS: 0 },
            feasible: true,
            stops: [previewStop(B, 1, 'INS-0043'), previewStop(A, 2, 'INS-0042')],
          },
        },
      }),
    });
  });
}

test.describe('Platform settings — Route planning (01.14 web)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, AM_USER);
    await mockSettings(page);
    await mockInspectorSearch(page);
    await mockPreview(page);
  });

  test('AM sets a weight to 0, previews an order change, saves, and it persists on reload', async ({ page }) => {
    await page.goto('/platform-settings');

    const windowWait = page.getByLabel('Waiting for windows');
    await expect(windowWait).toHaveValue('1');
    await windowWait.fill('0');

    // Pick an inspector in the searchable combobox (focus opens + queries).
    await page.getByRole('combobox', { name: 'Inspector' }).click();
    await page.getByRole('option', { name: 'Inspector Smith' }).click();

    await page.getByRole('button', { name: 'Preview' }).click();

    await expect(page.getByText('Saved weights')).toBeVisible();
    await expect(page.getByText('Weights in this form')).toBeVisible();
    await expect(page.getByText('Order changes with these weights')).toBeVisible();

    // Scope Save to the Route planning card (the page also has Field events).
    const routePlanningCard = page
      .locator('div.rounded.bg-card-bg')
      .filter({ has: page.getByRole('heading', { name: 'Route planning' }) });
    await routePlanningCard.getByRole('button', { name: 'Save changes' }).click();

    await page.reload();
    await expect(page.getByLabel('Waiting for windows')).toHaveValue('0');
  });
});
