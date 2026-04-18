import { test, expect } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockAppointmentDetail,
  mockFormOptions,
  makeAppointment,
} from './helpers';

test.describe('Reject Scheduled Appointment (T032)', () => {
  const scheduledAppointment = makeAppointment({
    id: 'apt-sched-1',
    code: 'APT-2001',
    appointmentNumber: 2001,
    status: 'SCHEDULED',
  });

  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page);
    await mockFormOptions(page);
    await mockAppointmentList(page, [scheduledAppointment]);
    await mockAppointmentDetail(page, scheduledAppointment);
  });

  test('displays Reject button for SCHEDULED appointment as AM', async ({ page }) => {
    await page.goto('/appointments');

    // Click the view action to open the detail drawer
    await page.getByRole('button', { name: 'View' }).first().click();

    // The detail drawer should open and show the Reject button
    await expect(page.getByText('Reject')).toBeVisible();
  });

  test('opens reason dialog on Reject click and requires reason code', async ({ page }) => {
    await page.goto('/appointments');
    await page.getByRole('button', { name: 'View' }).first().click();

    // Click Reject button
    await page.getByText('Reject').click();

    // Reason dialog should appear
    await expect(page.getByText('Are you sure you want to transition to "Reject"?')).toBeVisible();
    await expect(page.getByText('Reason Code')).toBeVisible();

    // Confirm should be disabled until reason code is selected
    const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirmButton).toBeDisabled();
  });

  test('submits rejection with reason code and closes dialog', async ({ page }) => {
    let transitionPayload: Record<string, unknown> | null = null;

    await page.route('**/v1/appointments/apt-sched-1/status-transitions', async (route) => {
      transitionPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...scheduledAppointment, status: 'REJECTED' } }),
      });
    });

    await page.goto('/appointments');
    await page.getByRole('button', { name: 'View' }).first().click();
    await page.getByText('Reject').click();

    // Open the reason code dropdown (scoped to dialog) and select first option
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason Code').click();
    await dialog.getByRole('option').first().click();

    // Confirm should now be enabled
    const confirmButton = dialog.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // Verify the API was called with REJECTED status
    expect(transitionPayload).not.toBeNull();
    expect((transitionPayload as Record<string, unknown>).targetStatus).toBe('REJECTED');
  });

  test('allows free-text reason when OTHER is selected', async ({ page }) => {
    let transitionPayload: Record<string, unknown> | null = null;

    await page.route('**/v1/appointments/apt-sched-1/status-transitions', async (route) => {
      transitionPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...scheduledAppointment, status: 'REJECTED' } }),
      });
    });

    await page.goto('/appointments');
    await page.getByRole('button', { name: 'View' }).first().click();
    await page.getByText('Reject').click();

    // Open reason code dropdown and select OTHER
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason Code').click();
    await dialog.getByRole('option', { name: /Other/i }).click();

    // Free text field should appear; confirm still disabled until text entered
    const textarea = dialog.getByPlaceholder('Enter the reason...');
    await expect(textarea).toBeVisible();

    await textarea.fill('Property access issue');

    const confirmButton = dialog.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    expect(transitionPayload).not.toBeNull();
    expect((transitionPayload as Record<string, unknown>).reason).toContain('Property access issue');
  });
});
