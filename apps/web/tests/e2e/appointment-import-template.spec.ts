import { test, expect } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockFormOptions,
} from './helpers';

test.describe('Import Template Download (T035)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page);
    await mockFormOptions(page);
  });

  test('import page shows Download template link', async ({ page }) => {
    await page.goto('/appointments/import');

    const downloadLink = page.getByText('Download template');
    await expect(downloadLink).toBeVisible();
  });

  test('download link points to correct CSV file', async ({ page }) => {
    await page.goto('/appointments/import');

    const downloadLink = page.getByText('Download template');
    const href = await downloadLink.getAttribute('href');
    expect(href).toBe('/templates/appointments-import-template.csv');
  });

  test('download link has download attribute', async ({ page }) => {
    await page.goto('/appointments/import');

    const downloadLink = page.getByText('Download template');
    const downloadAttr = await downloadLink.getAttribute('download');
    expect(downloadAttr).toBeTruthy();
  });

  test('template file is served and contains expected CSV headers', async ({ page }) => {
    const response = await page.request.get('/templates/appointments-import-template.csv');
    expect(response.ok()).toBe(true);

    const body = await response.text();
    const headers = body.split('\n')[0]!;

    expect(headers).toContain('branchName');
    expect(headers).toContain('propertyCode');
    expect(headers).toContain('serviceTypeCode');
    expect(headers).toContain('scheduledDate');
    expect(headers).toContain('timeSlot');
    expect(headers).toContain('keyRequired');
    expect(headers).toContain('primaryContactName');
    expect(headers).toContain('primaryContactEmail');
    expect(headers).toContain('primaryContactPhone');
    expect(headers).toContain('notes');
  });

  test('template CSV has example data rows', async ({ page }) => {
    const response = await page.request.get('/templates/appointments-import-template.csv');
    const body = await response.text();
    const lines = body.trim().split('\n');

    // Header + at least 1 example row
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Verify example data has correct column count
    const headerCols = lines[0]!.split(',').length;
    const dataCols = lines[1]!.split(',').length;
    expect(dataCols).toBe(headerCols);
  });

  test('import page shows file upload area', async ({ page }) => {
    await page.goto('/appointments/import');

    // The upload step should show "Upload File" heading and Next button
    await expect(page.getByText('Upload File')).toBeVisible();
    await expect(page.getByText('Next')).toBeVisible();
  });
});
