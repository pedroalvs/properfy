import { test, expect } from '@playwright/test';

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('refresh_token', 'test-refresh');
    });

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
  });

  test('shows marketplace with offers', async ({ page }) => {
    await page.route('**/v1/marketplace/offers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          offers: [
            {
              groupId: 'group-1',
              serviceTypeName: 'Routine Inspection',
              flowType: 'ROUTINE',
              scheduledDate: '2026-03-20',
              timeWindowStart: '2026-03-20T09:00:00.000Z',
              timeWindowEnd: '2026-03-20T11:00:00.000Z',
              region: 'Brunswick, Fitzroy',
              suburbs: ['Brunswick', 'Fitzroy'],
              appointmentCount: 3,
              distance: 5.2,
              publishedAt: '2026-03-18T00:00:00.000Z',
            },
          ],
          totalCount: 1,
        }),
      });
    });

    // Mock schedule for nav
    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });

    await page.goto('/marketplace');
    await expect(page.getByTestId('marketplace-page')).toBeVisible();
    await expect(page.getByTestId('offer-card-group-1')).toBeVisible();
    await expect(page.getByText('Routine Inspection')).toBeVisible();
    await expect(page.getByText('3 inspections')).toBeVisible();
  });

  test('shows empty state when no offers', async ({ page }) => {
    await page.route('**/v1/marketplace/offers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ offers: [], totalCount: 0 }),
      });
    });

    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });

    await page.goto('/marketplace');
    await expect(page.getByText('No offers available')).toBeVisible();
  });
});
