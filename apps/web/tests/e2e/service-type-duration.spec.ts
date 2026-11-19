import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupAuth, mockMeEndpoint, AM_USER } from './helpers';

function makeType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresRentalTenantConfirmation: true,
    status: 'ACTIVE',
    defaultDurationMinutes: 45,
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    ...overrides,
  };
}

interface Captured {
  postBody?: Record<string, unknown>;
  patchBody?: Record<string, unknown>;
}

async function mockServiceTypes(page: Page, captured: Captured) {
  const types = [makeType()];

  // List (has a query string).
  await page.route('**/v1/service-types?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: types,
        pagination: { page: 1, pageSize: 20, total: types.length, totalPages: 1 },
      }),
    });
  });

  // Create (POST, no query) and detail/update (GET/PATCH on /:id).
  await page.route('**/v1/service-types', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    captured.postBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: makeType({ id: 'st-2', ...captured.postBody }) }),
    });
  });

  await page.route('**/v1/service-types/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      captured.patchBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: makeType({ ...captured.patchBody }) }),
      });
    }
    // GET detail
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: makeType() }),
    });
  });
}

test.describe('Service type — estimated duration (B5 web)', () => {
  test('AM creates a type with 60 min and edits an existing one to 50', async ({ page }) => {
    const captured: Captured = {};
    await setupAuth(page);
    await mockMeEndpoint(page, AM_USER);
    await mockServiceTypes(page, captured);

    await page.goto('/service-types');

    // Create with 60.
    await page.getByRole('button', { name: 'New Service Type' }).click();
    await page.getByLabel('Code').fill('ROUTINE_IN');
    await page.getByLabel('Name').fill('Routine Ingoing');
    await page.getByLabel('Flow Type').click();
    await page.getByRole('option', { name: 'Routine' }).click();
    await page.getByLabel('Estimated duration (min)').fill('60');
    await page.getByRole('button', { name: 'Create Service Type' }).click();

    await expect.poll(() => captured.postBody?.defaultDurationMinutes).toBe(60);

    // The success toast confirms the create drawer saved and closed.
    await expect(page.getByText('Service type created successfully')).toBeVisible();

    // Edit the existing type to 50 (scope to the desktop table row — the mobile
    // card layout is display:none at this viewport but still in the DOM).
    await page.getByRole('row', { name: /Routine Inspection/ }).getByLabel('Edit').click();
    await expect(page.getByRole('heading', { name: 'Edit Service Type' })).toBeVisible();
    const duration = page.getByLabel('Estimated duration (min)');
    await expect(duration).toHaveValue('45');
    await duration.fill('50');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => captured.patchBody?.defaultDurationMinutes).toBe(50);
  });
});
