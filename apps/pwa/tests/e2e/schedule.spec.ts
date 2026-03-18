import { test, expect } from '@playwright/test';

test.describe('Schedule', () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth tokens in localStorage before navigating
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('refresh_token', 'test-refresh');
    });
  });

  test('shows schedule page with day selector', async ({ page }) => {
    // Mock the /v1/me endpoint
    await page.route('**/v1/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          name: 'Inspector',
          email: 'insp@test.com',
          role: 'INSP',
          tenantId: null,
        }),
      });
    });

    // Mock schedule endpoint
    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });

    await page.goto('/schedule');
    await expect(page.getByTestId('schedule-page')).toBeVisible();
    await expect(page.getByTestId('day-selector-strip')).toBeVisible();
  });

  test('shows bottom navigation with 5 tabs', async ({ page }) => {
    await page.route('**/v1/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          name: 'Inspector',
          email: 'insp@test.com',
          role: 'INSP',
          tenantId: null,
        }),
      });
    });

    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });

    await page.goto('/schedule');
    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    await expect(page.getByTestId('nav-schedule')).toBeVisible();
    await expect(page.getByTestId('nav-offers')).toBeVisible();
    await expect(page.getByTestId('nav-map')).toBeVisible();
    await expect(page.getByTestId('nav-earnings')).toBeVisible();
    await expect(page.getByTestId('nav-profile')).toBeVisible();
  });
});
