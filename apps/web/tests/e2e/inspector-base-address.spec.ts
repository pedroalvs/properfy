import { test, expect } from '@playwright/test';
import { setupAuth, mockMeEndpoint } from './helpers';

/**
 * F01-2 — web inspector app adoption + base-location display.
 * Every API call is stubbed (web E2E is a hermetic CI gate). The drawer base
 * address is F01-1's and out of scope here; this spec covers the table columns,
 * the "No base address" badge + filter, and the detail sections.
 */

const LOCATED = {
  id: 'insp-located',
  name: 'Alice Located',
  email: 'alice@inspecoes.com',
  phone: '0400000001',
  status: 'ACTIVE',
  regionIds: [],
  serviceTypesJson: [],
  blockedClients: [],
  address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
  baseLat: -33.8688,
  baseLng: 151.2093,
  baseGeocodedAt: '2026-03-01T00:00:00.000Z',
  appInstalledAt: '2026-02-20T00:00:00.000Z',
  appLastSeenAt: '2026-03-01T00:00:00.000Z',
  pushEnabled: true,
  appVersion: '0.1.0+ab12cd3',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const NO_BASE = {
  id: 'insp-nobase',
  name: 'Bob NoBase',
  email: 'bob@inspecoes.com',
  phone: '0400000002',
  status: 'ACTIVE',
  regionIds: [],
  serviceTypesJson: [],
  blockedClients: [],
  address: null,
  baseLat: null,
  baseLng: null,
  baseGeocodedAt: null,
  appInstalledAt: null,
  appLastSeenAt: null,
  pushEnabled: null,
  appVersion: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function listBody(items: unknown[]) {
  return JSON.stringify({
    data: items,
    pagination: { page: 1, pageSize: 10, total: items.length, totalPages: 1 },
  });
}

test.describe('F01-2 inspector base address & app adoption (web)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page);

    // Detail endpoint: /v1/inspectors/<id> (no query). Disjoint from the list glob.
    await page.route('**/v1/inspectors/*', async (route) => {
      const url = route.request().url();
      const item = url.includes('insp-nobase') ? NO_BASE : LOCATED;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: item }),
      });
    });

    // List endpoint: honours the missingBaseAddress filter.
    await page.route('**/v1/inspectors?**', async (route) => {
      const url = new URL(route.request().url());
      const onlyMissing = url.searchParams.get('missingBaseAddress') === 'true';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: listBody(onlyMissing ? [NO_BASE] : [LOCATED, NO_BASE]),
      });
    });

    // Catalogs the detail view may resolve — keep empty so nothing hangs.
    for (const path of ['service-types', 'service-regions', 'tenants']) {
      await page.route(`**/v1/${path}?**`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
        });
      });
    }
  });

  test('table shows App / Push / Last seen and the "No base address" badge', async ({ page }) => {
    await page.goto('/inspectors');

    await expect(page.getByText('Alice Located')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'App' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Push' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Last seen' })).toBeVisible();

    // Located inspector: installed + push on; the no-base inspector shows the
    // badge inside the table (the filter also carries the same label text).
    await expect(page.getByText('Installed')).toBeVisible();
    await expect(page.getByRole('table').getByText('No base address')).toBeVisible();
  });

  test('"No base address" filter lists only inspectors without a located base', async ({ page }) => {
    await page.goto('/inspectors');
    await expect(page.getByText('Alice Located')).toBeVisible();

    await page.getByLabel('No base address').click();

    await expect(page.getByText('Bob NoBase')).toBeVisible();
    await expect(page.getByText('Alice Located')).toHaveCount(0);
  });

  test('detail shows the Base Address and App Adoption sections', async ({ page }) => {
    await page.goto('/inspectors');
    await expect(page.getByText('Alice Located')).toBeVisible();

    // Open the located inspector's detail.
    await page.getByRole('row', { name: /Alice Located/ }).getByLabel('View').click();

    // Scope to the detail dialog: the (closed) create/edit form drawer also owns a
    // "Base Address" FormSection heading, so a page-wide query is ambiguous. The
    // detail drawer is the only dialog with an "App Adoption" section.
    const detail = page.getByRole('dialog').filter({ hasText: 'App Adoption' });
    await expect(detail.getByRole('heading', { name: 'Base Address' })).toBeVisible();
    await expect(detail.getByText(/Located · Updated/)).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'App Adoption' })).toBeVisible();
    await expect(detail.getByText('0.1.0+ab12cd3')).toBeVisible();
  });
});
