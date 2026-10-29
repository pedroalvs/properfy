import { test, expect } from '@playwright/test';
import { stubJson } from './support/api';
import { loginAsInspector } from './support/auth';
import { SCHEDULE_APPOINTMENT, makeScheduleMonth } from './support/fixtures';

/**
 * "Today" in the app's civil-date logic is Sydney wall-clock. The runner is UTC in
 * CI, so a `new Date()` here would diverge from the app between ~00:00 and ~10:00
 * Sydney. Derive the date in the Sydney zone so the card/day-strip line up with the
 * app's notion of today regardless of the host clock.
 */
function sydneyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

test.describe('Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsInspector(page);
  });

  test('shows schedule page with day selector', async ({ page }) => {
    const today = sydneyToday();
    await stubJson(page, '/v1/inspector/schedule/month', { data: makeScheduleMonth(today) });

    await page.goto('/schedule');
    await expect(page.getByTestId('schedule-page')).toBeVisible();
    await expect(page.getByTestId('day-selector-strip')).toBeVisible();
  });

  test('shows bottom navigation with 4 tabs', async ({ page }) => {
    const today = sydneyToday();
    await stubJson(page, '/v1/inspector/schedule/month', { data: makeScheduleMonth(today) });

    await page.goto('/schedule');
    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    await expect(page.getByTestId('nav-schedule')).toBeVisible();
    await expect(page.getByTestId('nav-offers')).toBeVisible();
    await expect(page.getByTestId('nav-earnings')).toBeVisible();
    await expect(page.getByTestId('nav-profile')).toBeVisible();
  });

  // The schedule card shows the appointment code but NOT the property (realty) code,
  // even when the payload carries one. The page reads /v1/inspector/schedule/month.
  test('appointment card shows the appointment code but not the property code', async ({ page }) => {
    const today = sydneyToday();
    const appointment = { ...SCHEDULE_APPOINTMENT, scheduledDate: today };
    await stubJson(page, '/v1/inspector/schedule/month', {
      data: makeScheduleMonth(today, [appointment]),
    });

    await page.goto('/schedule');
    const card = page.getByTestId(`appointment-card-${appointment.id}`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId('appointment-code')).toHaveText('INS-0042');
    // The property (realty) code is not shown on the schedule card. Assert the
    // actual code VALUE from the payload is absent (a real regression guard — it
    // would fail if the card started surfacing it), not a never-rendered test id.
    await expect(page.getByText(appointment.propertyCode)).toHaveCount(0);
  });
});
