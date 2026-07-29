import { test, expect, type Page } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockFormOptions,
  makeAppointment,
} from './helpers';

/**
 * The map screen must occupy exactly the viewport — no document scroll.
 *
 * It used to scroll because `MapScreenLayout` claimed a hard `h-screen`
 * (100vh) while AppShell wrapped every route in `px-4 py-2 md:px-8 md:py-6`
 * under a `min-h-screen` <main> that never clamped vertical height. The page
 * cancelled only the TOP padding with negative margins, so the leftover bottom
 * padding (desktop) and the mobile top bar overflowed the document.
 *
 * These assertions are box-model only, so they do not need a working Mapbox
 * token: MapContainer renders `h-full w-full` whether it shows the live canvas
 * or the token-missing placeholder, and the mapbox canvas is absolutely
 * positioned, so neither contributes flow height.
 */

/** Block Mapbox network so the test is deterministic and token-independent. */
async function blockMapbox(page: Page) {
  await page.route('**://*.mapbox.com/**', (route) => route.abort());
}

async function mockMapData(page: Page) {
  // No `?` in the glob: `**/v1/x?**` only matches requests that carry a query
  // string, so a bare `/v1/service-groups` would fall through to the network.
  for (const path of ['service-groups', 'inspectors', 'service-types']) {
    await page.route(`**/v1/${path}**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
        }),
      });
    });
  }
}

/** Vertical overflow of the document beyond the viewport, in CSS pixels. */
async function verticalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

test.describe('Map screen does not scroll', () => {
  test.beforeEach(async ({ page }) => {
    await blockMapbox(page);
    await setupAuth(page);
    await mockMeEndpoint(page);
    await mockFormOptions(page);
    await mockMapData(page);
    await mockAppointmentList(page, []);
  });

  test('desktop: document fits the viewport and will not scroll', async ({ page }) => {
    await page.goto('/map');
    await expect(page.getByTestId('map-screen-layout')).toBeVisible();

    // 1px tolerance for subpixel rounding only. Pre-fix this was ~24px.
    expect(await verticalOverflow(page)).toBeLessThanOrEqual(1);

    // And it genuinely cannot be scrolled.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('desktop: the map fills the viewport height with no dead strip', async ({ page }) => {
    await page.goto('/map');
    const layout = page.getByTestId('map-screen-layout');
    await expect(layout).toBeVisible();

    const box = (await layout.boundingBox())!;
    const viewportHeight = page.viewportSize()!.height;
    // Fills the viewport (allowing only subpixel slack) and does not exceed it.
    expect(box.height).toBeGreaterThanOrEqual(viewportHeight - 1);
    expect(box.height).toBeLessThanOrEqual(viewportHeight + 1);
  });

  test('mobile: top bar is accounted for, still no scroll', async ({ page }) => {
    // The old negative-margin hack never compensated the ~48px hamburger bar,
    // so this breakpoint overflowed the most.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/map');
    await expect(page.getByTestId('map-screen-layout')).toBeVisible();

    expect(await verticalOverflow(page)).toBeLessThanOrEqual(1);

    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('with the filter panel open it still does not scroll', async ({ page }) => {
    await page.goto('/map');
    await page.getByTestId('map-filter-toggle').click();
    await expect(page.getByTestId('map-side-panel')).toBeVisible();

    expect(await verticalOverflow(page)).toBeLessThanOrEqual(1);
  });

  // Control: proves the assertion above is capable of failing. Without this,
  // `overflow <= 1` could pass simply because nothing rendered.
  test('control: an ordinary list page still scrolls normally', async ({ page }) => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeAppointment({
        id: `apt-${i + 1}`,
        code: `APT-${4000 + i}`,
        appointmentNumber: 4000 + i,
        propertyAddress: `${100 + i} Test Street, Brunswick VIC 3056`,
      }),
    );
    await mockAppointmentList(page, many);

    await page.goto('/appointments');
    await expect(page.getByRole('search', { name: 'Filters' })).toBeVisible();

    expect(await verticalOverflow(page)).toBeGreaterThan(1);
  });
});
