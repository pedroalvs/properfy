import { test, expect } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockFormOptions,
  makeAppointment,
} from './helpers';

test.describe('Bulk Edit Flow (T033)', () => {
  const appointments = [
    makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    makeAppointment({ id: 'apt-2', code: 'APT-1002', appointmentNumber: 1002, status: 'DRAFT' }),
    makeAppointment({ id: 'apt-3', code: 'APT-1003', appointmentNumber: 1003, status: 'DRAFT' }),
  ];

  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page);
    await mockFormOptions(page);
    await mockAppointmentList(page, appointments);
  });

  test('shows checkboxes for AM user on appointment list', async ({ page }) => {
    await page.goto('/appointments');

    // Header "Select all" checkbox should be visible
    await expect(page.getByLabel('Select all')).toBeVisible();

    // Row checkboxes should be visible
    await expect(page.getByLabel('Select appointment APT-1001')).toBeVisible();
    await expect(page.getByLabel('Select appointment APT-1002')).toBeVisible();
  });

  test('selecting rows shows floating action bar with Bulk Edit button', async ({ page }) => {
    await page.goto('/appointments');

    // Select two appointments
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByLabel('Select appointment APT-1002').check();

    // Floating bar should appear
    await expect(page.getByText('2 appointments selected')).toBeVisible();
    await expect(page.getByText(/Bulk Edit/)).toBeVisible();
    await expect(page.getByText('Clear selection')).toBeVisible();
  });

  test('select all selects all visible rows', async ({ page }) => {
    await page.goto('/appointments');

    await page.getByLabel('Select all').check();

    // Should show count for all 3
    await expect(page.getByText('3 appointments selected')).toBeVisible();
  });

  test('clear selection removes all selections', async ({ page }) => {
    await page.goto('/appointments');

    await page.getByLabel('Select all').check();
    await expect(page.getByText('3 appointments selected')).toBeVisible();

    await page.getByText('Clear selection').click();

    // Floating bar should disappear
    await expect(page.getByText('3 appointments selected')).not.toBeVisible();
  });

  test('opens bulk edit modal and shows field checkboxes', async ({ page }) => {
    await page.goto('/appointments');

    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByText(/Bulk Edit/).click();

    // Modal should open with field checkboxes — scope to dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Bulk Edit \(1 appointment/)).toBeVisible();

    // Verify key fields are present in the dialog
    await expect(dialog.getByText('Select the fields you want to change')).toBeVisible();

    // Apply Changes should be visible
    await expect(dialog.getByText('Apply Changes')).toBeVisible();
  });

  test('submits bulk edit with selected fields', async ({ page }) => {
    let bulkEditPayload: Record<string, unknown> | null = null;

    await page.route('**/v1/appointments/bulk-edit', async (route) => {
      bulkEditPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updated: 2, failed: [] } }),
      });
    });

    await page.goto('/appointments');

    // Select two appointments
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByLabel('Select appointment APT-1002').check();
    await page.getByText(/Bulk Edit/).click();

    const dialog = page.getByRole('dialog');

    // Enable "Scheduled Date" field
    const scheduledDateCheckbox = dialog.locator('label:has-text("Scheduled Date") input[type="checkbox"]');
    await scheduledDateCheckbox.check();

    // Fill in the date input (use placeholder to distinguish from the form DateInput)
    const dateInput = dialog.getByPlaceholder('YYYY-MM-DD');
    await dateInput.fill('2026-05-01');

    // Submit
    await dialog.getByText('Apply Changes').click();

    // Verify the API was called
    expect(bulkEditPayload).not.toBeNull();
    const payload = bulkEditPayload as Record<string, unknown>;
    expect((payload.ids as string[]).length).toBe(2);
    expect((payload.changes as Record<string, unknown>).scheduledDate).toBe('2026-05-01');
  });

  test('shows results summary after bulk edit', async ({ page }) => {
    await page.route('**/v1/appointments/bulk-edit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            updated: 1,
            failed: [{ id: 'apt-2', code: 'APPOINTMENT_NOT_DRAFT', message: 'Appointment is in DONE status' }],
          },
        }),
      });
    });

    await page.goto('/appointments');
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByLabel('Select appointment APT-1002').check();
    await page.getByText(/Bulk Edit/).click();

    const dialog = page.getByRole('dialog');

    const scheduledDateCheckbox = dialog.locator('label:has-text("Scheduled Date") input[type="checkbox"]');
    await scheduledDateCheckbox.check();
    await dialog.getByPlaceholder('YYYY-MM-DD').fill('2026-05-01');
    await dialog.getByText('Apply Changes').click();

    // Results should display
    await expect(dialog.getByText('1 updated')).toBeVisible();
    await expect(dialog.getByText('1 failed')).toBeVisible();

    // Expandable error details
    await dialog.getByText(/Show.*error details/).click();
    await expect(dialog.getByText('Appointment is in DONE status')).toBeVisible();
  });
});
