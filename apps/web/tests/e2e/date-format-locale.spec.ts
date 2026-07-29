import { test, expect } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockFormOptions,
  makeAppointment,
} from './helpers';

/**
 * The acceptance test for the locale-proof inputs.
 *
 * Every other test in the series runs under a single locale, so none of them can
 * catch the failure that motivated this work: native `<input type="date">` and
 * `<input type="time">` follow the BROWSER's locale and cannot be overridden
 * from the page. Under `en-US` a native date control renders `mm/dd/yyyy` and a
 * native time control renders a 24-hour clock.
 *
 * If `type` stops being `text` below, a native control has crept back in and the
 * product has silently become locale-dependent again.
 *
 * Scope note: assertions about how dates/times are *displayed* in lists belong
 * with the display PRs; this branch only carries the input work.
 */
test.describe('date and time inputs are locale-proof', () => {
  const appointments = [
    makeAppointment({
      id: 'apt-1',
      code: 'APT-1001',
      appointmentNumber: 1001,
      status: 'DRAFT',
      scheduledDate: '2026-06-15',
      timeSlotStart: '09:00',
      timeSlotEnd: '13:00',
    }),
  ];

  // A US-configured browser: the worst case for anything locale-dependent.
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page);
    await mockFormOptions(page);
    await mockAppointmentList(page, appointments);
  });

  async function openBulkEdit(page: import('@playwright/test').Page) {
    await page.goto('/appointments');
    await page.getByLabel('Select appointment APT-1001').check();
    await page.getByText(/Bulk Edit/).click();
    // The appointment drawer behind the modal has identically-labelled fields.
    return page.getByRole('dialog', { name: /Bulk Edit/ });
  }

  test('the date field is a masked text input, not a native date control', async ({ page }) => {
    const modal = await openBulkEdit(page);
    // Each bulk-edit field is behind its own opt-in checkbox.
    await modal.locator('#bulk-scheduled-date-checkbox').check();

    const dateField = modal.getByLabel('Set scheduled date');
    await expect(dateField).toBeVisible();
    await expect(dateField).toHaveAttribute('type', 'text');

    await dateField.pressSequentially('01052030');
    // 1 May 2030. A native control under en-US would have accepted this as
    // January 5th and rendered '01/05/2030' meaning something different.
    await expect(dateField).toHaveValue('01/05/2030');
  });

  test('the date field keeps day-first order under a US locale', async ({ page }) => {
    const modal = await openBulkEdit(page);
    await modal.locator('#bulk-scheduled-date-checkbox').check();

    const dateField = modal.getByLabel('Set scheduled date');
    // 25 is impossible as a month, so this is unambiguous: day-first or nothing.
    await dateField.pressSequentially('25122026');
    await expect(dateField).toHaveValue('25/12/2026');
  });

  test('the time field is a masked text input, not a native time control', async ({ page }) => {
    const modal = await openBulkEdit(page);
    await modal.locator('#bulk-time-slot-checkbox').check();

    const startTime = modal.getByLabel('Start time');
    await expect(startTime).toBeVisible();
    await expect(startTime).toHaveAttribute('type', 'text');
  });

  test('typing a time requires an explicit meridiem before it is accepted', async ({ page }) => {
    const modal = await openBulkEdit(page);
    await modal.locator('#bulk-time-slot-checkbox').check();

    const startTime = modal.getByLabel('Start time');
    await startTime.pressSequentially('930');

    // Deliberately incomplete: the product never guesses am vs pm, because a
    // guess the user does not notice books an inspection twelve hours out.
    await expect(startTime).toHaveValue('9:30');
    await expect(startTime).toHaveAttribute('aria-invalid', 'true');

    await startTime.press('a');
    await expect(startTime).toHaveValue('9:30 am');
    await expect(startTime).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('the calendar popover renders month names day-first', async ({ page }) => {
    const modal = await openBulkEdit(page);
    await modal.locator('#bulk-scheduled-date-checkbox').check();

    // Type a date first so the calendar opens on a known month rather than today.
    await modal.getByLabel('Set scheduled date').pressSequentially('15062026');
    await modal.getByRole('button', { name: 'Open calendar' }).click();

    const calendar = modal.getByRole('dialog', { name: 'Choose date' });
    await expect(calendar).toBeVisible();

    // en-AU spells the day before the month; en-US would say 'June 15, 2026'.
    await expect(calendar.getByRole('button', { name: 'Monday 15 June 2026' })).toBeVisible();
    await expect(calendar.getByRole('button', { name: /June 15, 2026/ })).toHaveCount(0);
  });
});
