import { test, expect } from '@playwright/test';

test.describe('Schedule', () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth tokens in localStorage before navigating
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('refresh_token', 'test-refresh');
    });
  });

  test('shows schedule page with day selector', async ({ page }) => {
    // Mock the /v1/me endpoint
    await page.route('**/v1/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          name: 'Inspector',
          email: 'insp@test.com',
          role: 'INSP',
          tenantId: null,
        }),
      });
    });

    // Mock schedule endpoint
    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });

    await page.goto('/schedule');
    await expect(page.getByTestId('schedule-page')).toBeVisible();
    await expect(page.getByTestId('day-selector-strip')).toBeVisible();
  });

  test('shows bottom navigation with 4 tabs', async ({ page }) => {
    await page.route('**/v1/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          name: 'Inspector',
          email: 'insp@test.com',
          role: 'INSP',
          tenantId: null,
        }),
      });
    });

    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });

    await page.goto('/schedule');
    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    await expect(page.getByTestId('nav-schedule')).toBeVisible();
    await expect(page.getByTestId('nav-offers')).toBeVisible();
    await expect(page.getByTestId('nav-earnings')).toBeVisible();
    await expect(page.getByTestId('nav-profile')).toBeVisible();
  });

  // Doc §7.3: the schedule card shows the realty code beside the service code.
  // The page reads `/v1/inspector/schedule/month`, which the two specs above
  // never stub — hence the empty list they assert against.
  test('appointment card shows the property (realty) code', async ({ page }) => {
    await page.route('**/v1/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          name: 'Inspector',
          email: 'insp@test.com',
          role: 'INSP',
          tenantId: null,
        }),
      });
    });

    const today = new Date().toISOString().slice(0, 10);
    const appointment = {
      id: '00000000-0000-0000-0000-0000000000a1',
      appointmentCode: 'INS-0042',
      propertyCode: 'ACM-PROP-0007',
      status: 'SCHEDULED',
      scheduledDate: today,
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      serviceTypeId: '00000000-0000-0000-0000-0000000000b1',
      propertyId: '00000000-0000-0000-0000-0000000000c1',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      keyRequired: false,
      meetingLocation: null,
      executionStatus: 'NOT_STARTED',
      agencyName: 'Acme Realty',
      propertyAddress: '123 Collins St',
      suburb: 'Melbourne',
      serviceTypeName: 'Routine Inspection',
      flowType: 'ROUTINE',
    };

    await page.route('**/v1/inspector/schedule/month*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            today,
            from: today,
            to: today,
            days: [{ date: today, count: 1, hasUrgent: false }],
            appointments: [appointment],
            overdueAppointments: [],
          },
        }),
      });
    });

    await page.goto('/schedule');
    await expect(page.getByTestId(`appointment-card-${appointment.id}`)).toBeVisible();
    await expect(page.getByTestId('appointment-code')).toHaveText('INS-0042');
    await expect(page.getByTestId('property-code')).toHaveText('ACM-PROP-0007');
  });
});
