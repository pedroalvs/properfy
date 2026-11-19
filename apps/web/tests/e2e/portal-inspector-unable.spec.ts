import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const TOKEN = 'test-portal-token';

const portalData = {
  token: { status: 'ACTIVE', isReadOnly: false },
  appointment: {
    id: '00000000-0000-0000-0000-000000000002',
    status: 'REJECTED',
    rentalTenantConfirmationStatus: 'PENDING',
    scheduledDate: '2099-06-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    serviceTypeId: 'st-1',
    keyRequired: false,
    meetingLocation: null,
    notes: null,
    // L-F03-01: inspector-rejected — the tenant cannot pick a new time.
    canChangeTime: false,
  },
  contact: null,
  restrictions: [],
  existingResponse: null,
  agencyPhone: null,
  deadline: null,
};

async function mockPortalData(page: Page) {
  await page.route(`**/v1/rental-tenant-portal/${TOKEN}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalData),
      });
    } else {
      await route.fallback();
    }
  });
}

// Fails the test if the portal ever queries available groups for this appointment.
async function failIfAvailableGroupsQueried(page: Page) {
  await page.route(`**/v1/rental-tenant-portal/${TOKEN}/available-groups`, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SHOULD_NOT_BE_CALLED', message: 'available-groups must not be queried' } }),
    });
  });
}

test.describe('Portal — inspector-rejected appointment (L-F03-01)', () => {
  test('hides the change-time path and shows the agency-will-contact banner', async ({ page }) => {
    await mockPortalData(page);
    await failIfAvailableGroupsQueried(page);

    await page.goto(`/portal/${TOKEN}`);

    await expect(
      page.getByText(/The agency will contact you to arrange a new time\./i),
    ).toBeVisible();
    await expect(page.getByText(/will not go ahead/i)).toBeVisible();
    await expect(page.getByText(/pick another available time/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /change time/i })).toHaveCount(0);
  });
});
