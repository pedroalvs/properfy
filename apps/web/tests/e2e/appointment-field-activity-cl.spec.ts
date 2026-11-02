import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockAppointmentList,
  mockAppointmentDetail,
  mockFormOptions,
  makeAppointment,
} from './helpers';

const CL_ADMIN_USER = {
  id: 'user-cl-1',
  name: 'Clara Agency',
  email: 'cladmin@acme.example',
  role: 'CL_ADMIN',
  tenantId: 'tenant-1',
};

const appointment = makeAppointment({
  id: 'apt-cl-1',
  code: 'APT-4001',
  appointmentNumber: 4001,
  status: 'DONE',
});

// A CL payload: distances/accuracy/flags present, NO inspector coordinates.
async function mockFieldActivityCl(page: Page) {
  await page.route('**/v1/appointments/*/field-activity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          execution: {
            id: 'exec-1',
            inspectorName: 'Inspector Smith',
            startedAt: '2026-04-20T09:05:00+10:00',
            finishedAt: '2026-04-20T09:45:00+10:00',
            abandonedAt: null,
            startClientAt: null,
            finishClientAt: null,
            startDistanceMeters: 120,
            finishDistanceMeters: 95,
            startAccuracyMeters: 8,
            finishAccuracyMeters: 10,
            outOfRadius: true,
            outOfWindow: false,
            finishOutOfRadius: false,
            geofenceRadiusMeters: 300,
            // No startLatitude/startLongitude/finishLatitude/finishLongitude for CL.
          },
          events: [],
        },
      }),
    });
  });
}

test.describe('Field activity for CL (03.A2 web, privacy cut)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, CL_ADMIN_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, [appointment]);
    await mockAppointmentDetail(page, appointment);
    await mockFieldActivityCl(page);
  });

  test('shows distance and flags with no coordinate on the page', async ({ page }) => {
    await page.goto(`/appointments/${appointment.id}`);

    await expect(page.getByText('Field activity')).toBeVisible();
    await expect(page.getByText('Distance at check-in: 120 m (accuracy ±8 m)')).toBeVisible();
    await expect(page.getByText('Outside geofence (300 m)')).toBeVisible();

    // No raw inspector coordinate anywhere in the rendered page.
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toMatch(/-?\d{1,3}\.\d{4,}/);
  });
});
