import { test, expect } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockFormOptions,
  mockAppointmentList,
} from './helpers';

const CL_ADMIN_USER = {
  id: 'user-cl-admin-1',
  name: 'Agency Admin',
  email: 'agency-admin@properfy.com',
  role: 'CL_ADMIN',
  tenantId: 'tenant-1',
};

const EXPECTED_HEADERS = [
  'Type', 'Date', 'Start Time', 'End Time',
  'Street', 'Suburb', 'State', 'Postcode', 'Country', 'Address line 2',
  'Notes', 'Realty description',
  'Tenant name', 'Tenant mail', 'Tenant phone',
  'EMAIL: Tenant secondary mail', 'PHONE: Tenant secondary phone',
  'EMAIL: Tenant tertiary mail', 'PHONE: Tenant tertiary phone',
  'EMAIL: Tenant quaternary mail', 'PHONE: Tenant quaternary phone',
  'CUSTOM: Complete Property Address', 'CUSTOM: Access Instructions',
  'CUSTOM: Alarm Code', 'CUSTOM: Parking Notes',
];

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

  test('template file is served and contains the expected CSV headers', async ({ page }) => {
    const response = await page.request.get('/templates/appointments-import-template.csv');
    expect(response.ok()).toBe(true);

    const body = await response.text();
    const headers = body.split('\n')[0]!;

    for (const header of EXPECTED_HEADERS) {
      expect(headers).toContain(header);
    }
  });

  test('template CSV has exactly 4 CUSTOM: columns', async ({ page }) => {
    const response = await page.request.get('/templates/appointments-import-template.csv');
    const body = await response.text();
    const headers = body.split('\n')[0]!;

    const customColumnCount = headers.split(',').filter((h) => h.trim().startsWith('CUSTOM:')).length;
    expect(customColumnCount).toBe(4);
  });

  test('template CSV has example data rows with correctly-typed values', async ({ page }) => {
    const response = await page.request.get('/templates/appointments-import-template.csv');
    const body = await response.text();
    const lines = body.trim().split('\n');

    // Header + at least 1 example row
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Quote-aware split — a naive split(',') would over-count columns
    // because one example cell (CUSTOM: Complete Property Address)
    // legitimately contains commas inside a quoted field.
    const splitCsvLine = (line: string) => line.match(/(".*?"|[^,]+|(?<=,)(?=,|$))/g) ?? [];
    expect(splitCsvLine(lines[1]!).length).toBe(splitCsvLine(lines[0]!).length);

    // Phone keeps its leading 0 (would be lost if the cell were numeric-typed).
    expect(lines[1]).toContain('0400000001');
    // Date is ISO (not an Excel serial number).
    expect(lines[1]).toMatch(/2027-06-15/);
  });

  test('import page shows file upload area', async ({ page }) => {
    await page.goto('/appointments/import');

    // The upload step should show "Upload File" heading and Next button
    await expect(page.getByText('Upload File')).toBeVisible();
    await expect(page.getByText('Next')).toBeVisible();
  });
});

test.describe('CL_ADMIN reachability (mis-gated Import button regression guard)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, CL_ADMIN_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, []);
  });

  test('CL_ADMIN sees the Import CTA on the appointments list', async ({ page }) => {
    await page.goto('/appointments');

    await expect(page.getByRole('link', { name: /import/i }).or(page.getByRole('button', { name: /import/i }))).toBeVisible();
  });

  test('CL_ADMIN can reach the import wizard directly and sees only a Branch selector', async ({ page }) => {
    await page.goto('/appointments/import');

    await expect(page.getByText('Upload File')).toBeVisible();
    await expect(page.getByLabel('Branch')).toBeVisible();
    await expect(page.getByLabel('Agency')).toHaveCount(0);
  });
});
