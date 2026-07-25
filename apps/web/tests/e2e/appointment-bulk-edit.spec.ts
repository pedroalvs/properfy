import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockFormOptions,
  makeAppointment,
  AM_USER,
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

test.describe('Bulk Change Status', () => {
  const draftRows = [
    makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    makeAppointment({ id: 'apt-2', code: 'APT-1002', appointmentNumber: 1002, status: 'DRAFT' }),
  ];

  // These specs run as OP, not AM: per the shared matrix, DRAFT →
  // AWAITING_INSPECTOR is OP-only, so an AM user would never see it and the
  // intersection assertions below would pass for the wrong reason.
  const OP_USER = { ...AM_USER, role: 'OP' };

  async function openBulkEdit(page: Page, codes: string[]) {
    await page.goto('/appointments');
    for (const code of codes) {
      await page.getByLabel(`Select appointment ${code}`).check();
    }
    await page.getByRole('button', { name: /Bulk Edit/ }).click();
    return page.getByRole('dialog');
  }

  test('offers only transitions every selected row can reach', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    // DRAFT reaches AWAITING_INSPECTOR | REJECTED | CANCELLED.
    // SCHEDULED reaches only            REJECTED | CANCELLED.
    await mockAppointmentList(page, [
      draftRows[0]!,
      makeAppointment({ id: 'apt-9', code: 'APT-1009', appointmentNumber: 1009, status: 'SCHEDULED' }),
    ]);

    const dialog = await openBulkEdit(page, ['APT-1001', 'APT-1009']);
    await dialog.getByLabel('Change status').check();
    await dialog.getByLabel('Set target status').click();

    await expect(dialog.getByRole('option', { name: 'Rejected' })).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Cancelled' })).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Awaiting Inspector' })).toHaveCount(0);
  });

  test('warns when the selection has no transition in common', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    // DRAFT and CANCELLED share no target.
    await mockAppointmentList(page, [
      draftRows[0]!,
      makeAppointment({ id: 'apt-8', code: 'APT-1008', appointmentNumber: 1008, status: 'CANCELLED' }),
    ]);

    const dialog = await openBulkEdit(page, ['APT-1001', 'APT-1008']);
    await dialog.getByLabel('Change status').check();

    await expect(
      dialog.getByText('No common transition is available for the selected rows.'),
    ).toBeVisible();
  });

  test('requires a reason for CANCELLED and submits the batch', async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, draftRows);
    await page.route('**/v1/appointments/bulk-status-transition', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            results: [
              { appointmentId: 'apt-1', status: 'OK' },
              {
                appointmentId: 'apt-2',
                status: 'FORBIDDEN',
                error: { code: 'APPOINTMENT_TRANSITION_NOT_PERMITTED', message: 'Not permitted for your role' },
              },
            ],
          },
        }),
      });
    });

    const dialog = await openBulkEdit(page, ['APT-1001', 'APT-1002']);
    await dialog.getByLabel('Change status').check();

    // Apply stays disabled until a target is chosen.
    await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();

    await dialog.getByLabel('Set target status').click();
    await dialog.getByRole('option', { name: 'Cancelled' }).click();

    // Reason is required for CANCELLED — still disabled until it is filled.
    await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
    await dialog.getByLabel('Status change reason').fill('Tenant moved out');
    await dialog.getByRole('button', { name: 'Apply Changes' }).click();

    await expect(dialog.getByText('1 updated')).toBeVisible();
    await expect(dialog.getByText('1 failed')).toBeVisible();

    // Failures identify the row by its code, never a raw id fragment.
    await dialog.getByText(/Show.*error details/).click();
    await expect(dialog.getByText('APT-1002')).toBeVisible();
    await expect(dialog.getByText('Not permitted for your role')).toBeVisible();

    expect(payload).toEqual({
      appointmentIds: ['apt-1', 'apt-2'],
      targetStatus: 'CANCELLED',
      reason: 'Tenant moved out',
    });
  });

  test('omits the reason field for a transition that does not need one', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, draftRows);

    const dialog = await openBulkEdit(page, ['APT-1001']);
    await dialog.getByLabel('Change status').check();
    await dialog.getByLabel('Set target status').click();
    await dialog.getByRole('option', { name: 'Awaiting Inspector' }).click();

    await expect(dialog.getByLabel('Status change reason')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();
  });

  test('is mutually exclusive with the other bulk modes', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, draftRows);

    const dialog = await openBulkEdit(page, ['APT-1001']);
    await dialog.getByLabel('Change status').check();

    await expect(dialog.locator('label:has-text("Inspector") input[type="checkbox"]').first()).toBeDisabled();
    await expect(dialog.getByLabel('Mark as Reviewed')).toBeDisabled();
  });

  test('is hidden for a client admin', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, { ...AM_USER, role: 'CL_ADMIN' });
    await mockFormOptions(page);
    await mockAppointmentList(page, draftRows);

    const dialog = await openBulkEdit(page, ['APT-1001']);
    await expect(dialog.getByText('Select the fields you want to change')).toBeVisible();
    await expect(dialog.getByText('Change status')).toHaveCount(0);
  });
});
