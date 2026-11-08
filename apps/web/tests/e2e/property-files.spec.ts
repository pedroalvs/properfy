import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  setupAuth,
  mockMeEndpoint,
  mockFormOptions,
  mockAppointmentList,
  mockUnseenIssueCount,
  mockPropertyFiles,
  mockPropertyIssues,
  makeAppointment,
  AM_USER,
} from './helpers';

const PROPERTY = {
  id: 'prop-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  branchName: 'Brunswick Office',
  tenantName: 'Acme Realty',
  propertyCode: 'ACME-PROP-1',
  type: 'HOUSE',
  apartmentNumber: null,
  street: '123 Test Street',
  addressLine2: null,
  suburb: 'Brunswick',
  postcode: '3056',
  state: 'VIC',
  country: 'AU',
  geocodingStatus: 'SUCCESS',
  latitude: null,
  longitude: null,
  privateAreaM2: null,
  totalAreaM2: null,
  furnished: null,
  linenProvided: null,
  rentAmount: null,
  notes: null,
  createdAt: '2026-04-10T00:00:00.000Z',
  updatedAt: '2026-04-10T00:00:00.000Z',
};

async function mockPropertyDetail(page: Page) {
  await page.route('**/v1/properties/prop-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: PROPERTY }),
    });
  });
}

test.describe('Property files & issues — web (F10-2)', () => {
  test('appointment list shows the unseen-issue sidebar dot and row border', async ({ page }) => {
    await setupAuth(page);
    await mockUnseenIssueCount(page, { appointmentsWithUnseenIssues: 2, propertiesWithUnseenIssues: 0 });
    await mockMeEndpoint(page, AM_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, [
      makeAppointment({ id: 'apt-ui-1', code: 'APT-9001', appointmentNumber: 9001, hasUnseenIssues: true }),
    ]);

    await page.goto('/appointments');

    // Sidebar amber dot (AppShell → unseen-count) with its accessible count.
    await expect(page.getByTestId('sidebar-item-badge').first()).toBeVisible();
    await expect(page.getByText('2 unseen issues').first()).toBeAttached();

    // Row border for the appointment with an unseen issue.
    const row = page.locator('tr', { hasText: 'APT-9001' });
    await expect(row).toHaveClass(/border-l-warning/);
  });

  test('the "With issues" filter sends withIssues=true', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, AM_USER);
    await mockFormOptions(page);
    await mockAppointmentList(page, []);

    await page.goto('/appointments');
    const withIssuesRequest = page.waitForRequest(
      (req) => req.url().includes('/v1/appointments') && req.url().includes('withIssues=true'),
    );
    // click, not check(): the filter is a controlled checkbox whose state flips only
    // after a debounced URL round-trip, so .check()'s synchronous actionability
    // assertion races it. The request firing is what the test actually verifies.
    await page.getByLabel('With issues').click();
    await withIssuesRequest;
  });

  test('the property Files tab shows a linked issue with the appointment reference (C.A1)', async ({ page }) => {
    await setupAuth(page);
    await mockMeEndpoint(page, AM_USER);
    await mockPropertyDetail(page);
    await mockPropertyFiles(page, []);
    // Property appointments feed the appointmentId → code map.
    await mockAppointmentList(page, [
      makeAppointment({ id: 'apt-link-1', code: 'APT-5005', appointmentNumber: 5005, propertyId: 'prop-1' }),
    ]);
    await mockPropertyIssues(page, [
      {
        id: 'issue-1',
        propertyId: 'prop-1',
        appointmentId: 'apt-link-1',
        reason: 'Broken front gate',
        source: 'STAFF',
        createdByUserId: null,
        cantDoEventId: null,
        seenAt: null,
        seenByUserId: null,
        createdAt: '2026-04-20T00:00:00.000Z',
        photos: [],
      },
    ]);

    await page.goto('/properties/prop-1?tab=files&sub=issues');

    await expect(page.getByText('Broken front gate')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Appointment #APT-5005' })).toBeVisible();
  });
});
