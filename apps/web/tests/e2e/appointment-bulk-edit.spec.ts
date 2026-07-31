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

/**
 * A date comfortably in the future. A fixed literal rots: the previous one was
 * future when written and later tripped the past-date submit guard, so these
 * specs failed for a reason unrelated to what they test.
 */
const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();

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

    // The bulk modal uses a native date input, labelled rather than
    // placeholdered — the old getByPlaceholder('YYYY-MM-DD') could never match.
    await dialog.getByLabel('Set scheduled date').fill(FUTURE_DATE);

    // Submit
    await dialog.getByText('Apply Changes').click();

    // Verify the API was called
    expect(bulkEditPayload).not.toBeNull();
    const payload = bulkEditPayload as Record<string, unknown>;
    expect((payload.ids as string[]).length).toBe(2);
    expect((payload.changes as Record<string, unknown>).scheduledDate).toBe(FUTURE_DATE);
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
    await dialog.getByLabel('Set scheduled date').fill(FUTURE_DATE);
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
      // The fixtures are CONFIRMED, so the tenant opt-in is offered — and it is
      // sent explicitly false, because the operator did not tick it.
      notifyRentalTenant: false,
    });
  });

  test('opts confirmed tenants in only when the notify box is ticked', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, OP_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, draftRows);

    let payload: Record<string, unknown> | null = null;
    await page.route('**/v1/appointments/bulk-status-transition', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { results: [{ appointmentId: 'apt-1', status: 'OK' }] } }),
      });
    });

    const dialog = await openBulkEdit(page, ['APT-1001']);
    await dialog.getByLabel('Change status').check();
    await dialog.getByLabel('Set target status').click();
    await dialog.getByRole('option', { name: 'Cancelled' }).click();
    await dialog.getByLabel('Status change reason').fill('Agency withdrew the request');

    // The confirmed codes are named so the operator can see who gets contacted.
    const notifyBlock = dialog.getByTestId('bulk-edit-notify-block');
    await expect(notifyBlock).toBeVisible();
    await expect(notifyBlock).toContainText('APT-1001');

    // The native input is sr-only; the label text is the click target.
    await notifyBlock.getByText('Notify the tenants who confirmed').click();
    await dialog.getByRole('button', { name: 'Apply Changes' }).click();

    // Every row succeeded, so the modal reports success and closes itself — unlike
    // the test above, which keeps it open by returning one FORBIDDEN row. Named
    // explicitly: the page keeps other drawers mounted, so a bare
    // getByRole('dialog') is not strict-mode safe here.
    await expect(page.getByRole('dialog', { name: /Bulk Edit/ })).toBeHidden();
    expect(payload).toMatchObject({ targetStatus: 'CANCELLED', notifyRentalTenant: true });
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

    await expect(dialog.getByLabel('Inspector', { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Mark as Reviewed')).toBeDisabled();
  });

  test('is hidden for a client admin', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, { ...AM_USER, role: 'CL_ADMIN' });
    await mockFormOptions(page);
    await mockAppointmentList(page, draftRows);

    const dialog = await openBulkEdit(page, ['APT-1001']);
    await expect(dialog.getByText('Select the fields you want to change')).toBeVisible();
    await expect(dialog.getByLabel('Change status')).toHaveCount(0);
  });
});

test.describe('Bulk Change Status — dropdown is actually visible', () => {
  // Regression guard for the staging bug: the options rendered into the
  // dialog's clipped region, so the menu looked empty. Neither the unit tests
  // (jsdom does no layout) nor the other e2e specs caught it, because
  // Playwright auto-scrolls before clicking. This one measures geometry.
  test('renders the target-status options inside the dialog viewport', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, { ...AM_USER, role: 'OP' });
    await mockFormOptions(page);
    await mockAppointmentList(page, [
      makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    ]);

    await page.goto('/appointments');
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByRole('button', { name: /Bulk Edit/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Change status').check();
    // Open it via a direct DOM click: Playwright's click auto-scrolls the
    // trigger into view, which would itself relieve the clipping this test
    // exists to detect.
    await page.evaluate(() => {
      (document.querySelector('button[aria-label="Set target status"]') as HTMLButtonElement).click();
    });

    const fits = await page.evaluate(() => {
      const ul = document.querySelector('ul[role="listbox"][aria-label="Set target status"]');
      if (!ul) return { found: false };
      // Walk to whatever actually clips it.
      let node = ul.parentElement;
      while (node && node !== document.body) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') break;
        node = node.parentElement;
      }
      const menu = ul.getBoundingClientRect();
      const clip = (node ?? document.documentElement).getBoundingClientRect();
      const visible = Math.max(0, Math.min(menu.bottom, clip.bottom) - Math.max(menu.top, clip.top));
      return {
        found: true,
        options: ul.querySelectorAll('[role="option"]').length,
        menuHeight: Math.round(menu.height),
        visibleHeight: Math.round(visible),
      };
    });

    expect(fits.found).toBe(true);
    // Without these the visibility check passes vacuously on an empty menu,
    // since 0 >= 0 - 1.
    expect(fits.options).toBeGreaterThan(0);
    expect(fits.menuHeight).toBeGreaterThan(0);
    // Before the fix only ~4px of a 109px menu were inside the clip.
    expect(fits.visibleHeight).toBeGreaterThanOrEqual(fits.menuHeight! - 1);
  });
});

test.describe('Bulk Change Status — keyboard only', () => {
  // jsdom cannot prove real key handling. This drives the target-status menu
  // in Chromium without ever using the mouse on it.
  test('selects a target status with the keyboard alone', async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    await setupAuth(page);
    await mockMeEndpoint(page, { ...AM_USER, role: 'OP' });
    await mockFormOptions(page);
    await mockAppointmentList(page, [
      makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    ]);
    await page.route('**/v1/appointments/bulk-status-transition', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { results: [{ appointmentId: 'apt-1', status: 'OK' }] } }),
      });
    });

    await page.goto('/appointments');
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByRole('button', { name: /Bulk Edit/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Change status').check();

    // From here on: keyboard only.
    await dialog.getByRole('button', { name: 'Set target status' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('listbox')).toBeVisible();

    // Options are announced through aria-activedescendant, since <li> cannot
    // hold focus.
    const activeId = await dialog.getByRole('button', { name: 'Set target status' }).getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // The menu closed and the last option landed in the trigger.
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Set target status' })).toContainText('Cancelled');

    await dialog.getByLabel('Status change reason').fill('Keyboard-only smoke');
    await dialog.getByRole('button', { name: 'Apply Changes' }).click();

    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toMatchObject({ targetStatus: 'CANCELLED' });
  });

  test('Escape closes the menu without choosing anything', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, { ...AM_USER, role: 'OP' });
    await mockFormOptions(page);
    await mockAppointmentList(page, [
      makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    ]);

    await page.goto('/appointments');
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByRole('button', { name: /Bulk Edit/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Change status').check();
    await dialog.getByRole('button', { name: 'Set target status' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
  });
});

test.describe('Contact autocomplete — keyboard only', () => {
  // The PM-contact field sits inside the bulk-edit dialog, which is the risky
  // context: Escape reaches a document listener there, and the suggestion list
  // can be clipped by the dialog's scroll container.
  test('picks a contact with the keyboard and Escape spares the dialog', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, { ...AM_USER, role: 'OP' });
    await mockFormOptions(page);
    await mockAppointmentList(page, [
      makeAppointment({ id: 'apt-1', code: 'APT-1001', appointmentNumber: 1001, status: 'DRAFT' }),
    ]);
    await page.route('**/v1/contacts?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'c1', displayName: 'Alice Smith', type: 'PROPERTY_MANAGER', primaryEmail: 'alice@x.com', primaryPhone: null },
            { id: 'c2', displayName: 'Bob Jones', type: 'PROPERTY_MANAGER', primaryEmail: 'bob@x.com', primaryPhone: null },
          ],
          total: 2,
          page: 1,
          pageSize: 10,
        }),
      });
    });

    await page.goto('/appointments');
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByRole('button', { name: /Bulk Edit/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Add Property Manager Contact/).check();

    const input = dialog.getByRole('combobox', { name: 'Property Manager Contact' });
    await input.focus();
    await input.fill('ali');
    await expect(dialog.getByRole('option').first()).toBeVisible();

    // Keyboard only from here.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const activeId = await input.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    await expect(page.locator(`#${activeId!.replace(/:/g, '\\:')}`)).toContainText('Bob Jones');

    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(input).toHaveValue('Bob Jones');

    // Reopen, then Escape: suggestions go, the dialog stays.
    await input.focus();
    await input.fill('ali');
    await expect(dialog.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(dialog.getByText('Select the fields you want to change')).toBeVisible();
  });
});
