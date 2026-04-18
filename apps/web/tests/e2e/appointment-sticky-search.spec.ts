import { test, expect } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockFormOptions,
  makeAppointment,
} from './helpers';

function generateAppointments(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeAppointment({
      id: `apt-${i + 1}`,
      code: `APT-${3000 + i}`,
      appointmentNumber: 3000 + i,
      status: i % 2 === 0 ? 'SCHEDULED' : 'DRAFT',
      propertyAddress: `${100 + i} Test Street, Brunswick VIC 3056`,
    }),
  );
}

test.describe('Sticky Search Filter (T034)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page);
    await mockFormOptions(page);
    await mockAppointmentList(page, generateAppointments(30));
  });

  test('FilterBar has sticky positioning', async ({ page }) => {
    await page.goto('/appointments');

    // Verify the FilterBar exists with role="search"
    const filterBar = page.getByRole('search', { name: 'Filters' });
    await expect(filterBar).toBeVisible();

    // Verify the FilterBar has sticky CSS class
    const classes = await filterBar.getAttribute('class');
    expect(classes).toContain('sticky');
    expect(classes).toContain('top-0');
    expect(classes).toContain('z-10');
  });

  test('FilterBar remains visible after scrolling down the page', async ({ page }) => {
    await page.goto('/appointments');

    const filterBar = page.getByRole('search', { name: 'Filters' });
    await expect(filterBar).toBeVisible();

    // Scroll down significantly
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(300);

    // FilterBar should still be visible (sticky)
    await expect(filterBar).toBeVisible();

    // The filter bar should be within viewport (top portion)
    const boundingBox = await filterBar.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox!.y).toBeLessThanOrEqual(50);
  });

  test('search input remains functional while scrolled', async ({ page }) => {
    let lastSearchQuery = '';

    // Intercept search requests to capture the query
    await page.route('**/v1/appointments?**', async (route) => {
      const url = new URL(route.request().url());
      lastSearchQuery = url.searchParams.get('search') ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: lastSearchQuery
            ? [makeAppointment({ code: 'APT-FOUND', propertyAddress: '999 Found St' })]
            : generateAppointments(30),
          pagination: { page: 1, pageSize: 20, total: lastSearchQuery ? 1 : 30, totalPages: 1 },
        }),
      });
    });

    await page.goto('/appointments');

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(200);

    // Search input should still be accessible and interactable (uses aria-label="Search")
    const searchInput = page.getByLabel('Search', { exact: true });
    await expect(searchInput).toBeVisible();
    await searchInput.fill('APT-FOUND');

    // Wait for debounce and verify search works
    await page.waitForTimeout(500);
    await expect(page.getByText('APT-FOUND')).toBeVisible();
  });
});
