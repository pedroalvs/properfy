import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const TOKEN = 'test-portal-token';
const GROUP_ID = '00000000-0000-0000-0000-000000000001';

const portalData = {
  token: {
    status: 'ACTIVE',
    isReadOnly: false,
    isExpired: false,
    canRequestNewLink: false,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  appointment: {
    id: '00000000-0000-0000-0000-000000000002',
    status: 'AWAITING_INSPECTOR',
    tenantConfirmationStatus: 'PENDING',
    scheduledDate: '2099-06-01',
    timeSlot: 'MORNING',
    serviceTypeId: 'st-1',
    keyRequired: false,
    meetingLocation: null,
    notes: null,
  },
  contact: null,
  restrictions: [],
  existingResponse: null,
  rescheduleAllowed: true,
  agencyPhone: null,
  deadline: null,
};

const groupsList = {
  groups: [
    {
      id: GROUP_ID,
      scheduledDate: '2099-06-05',
      timeWindow: '09:00-12:00',
      suburb: 'Surry Hills',
      inspectorName: 'John Smith',
      confirmedCount: 3,
      capacityMax: 10,
    },
  ],
};

async function mockPortalData(page: Page, overrides: Partial<typeof portalData> = {}) {
  await page.route(`**/v1/tenant-portal/${TOKEN}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...portalData, ...overrides }),
      });
    } else {
      await route.fallback();
    }
  });
}

async function mockAvailableGroups(
  page: Page,
  groups: typeof groupsList = groupsList,
) {
  await page.route(`**/v1/tenant-portal/${TOKEN}/available-groups`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(groups),
    });
  });
}

async function mockJoinGroup(page: Page, status = 200) {
  await page.route(`**/v1/tenant-portal/${TOKEN}/join-group`, async (route) => {
    if (status === 200) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scheduledDate: '2099-06-05',
          timeWindow: '09:00-12:00',
          tenantConfirmationStatus: 'CONFIRMED',
          appointmentStatus: 'SCHEDULED',
          inspector: { id: '00000000-0000-0000-0000-000000000010', name: 'John Smith' },
        }),
      });
    } else {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'PORTAL_GROUP_FULL', message: 'Group is full' } }),
      });
    }
  });
}

test.describe('Portal — Join Group (US2)', () => {
  test('happy path: select group and join', async ({ page }) => {
    let callCount = 0;
    await page.route(`**/v1/tenant-portal/${TOKEN}`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      callCount++;
      const body = callCount === 1
        ? { ...portalData }
        : { ...portalData, appointment: { ...portalData.appointment, tenantConfirmationStatus: 'CONFIRMED' } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await mockAvailableGroups(page);
    await mockJoinGroup(page, 200);

    await page.goto(`/tenant-portal/${TOKEN}`);
    await expect(page.getByText('Do you confirm the inspection?')).toBeVisible();

    await page.getByRole('button', { name: 'Change time' }).click();
    await expect(page.getByText('Select an available time')).toBeVisible();
    await expect(page.getByText('Surry Hills')).toBeVisible();

    await page.getByTestId('group-row').click();
    await expect(page.getByRole('button', { name: 'Join this time slot' })).toBeVisible();

    await page.getByRole('button', { name: 'Join this time slot' }).click();
    await expect(page.getByText('Attendance Confirmed')).toBeVisible({ timeout: 5000 });
  });

  test('cancel: back button collapses the change-time panel', async ({ page }) => {
    await mockPortalData(page);
    await mockAvailableGroups(page);

    await page.goto(`/tenant-portal/${TOKEN}`);
    await page.getByRole('button', { name: 'Change time' }).click();
    await expect(page.getByText('Select an available time')).toBeVisible();

    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page.getByText('Select an available time')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Change time' })).toBeVisible();
  });

  test('empty groups: shows "No available times nearby"', async ({ page }) => {
    await mockPortalData(page);
    await mockAvailableGroups(page, { groups: [] });

    await page.goto(`/tenant-portal/${TOKEN}`);
    await page.getByRole('button', { name: 'Change time' }).click();
    await expect(page.getByText('No available times nearby.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join this time slot' })).not.toBeVisible();
  });

  test('320px smoke: change-time panel renders without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await mockPortalData(page);
    await mockAvailableGroups(page);

    await page.goto(`/tenant-portal/${TOKEN}`);
    await page.getByRole('button', { name: 'Change time' }).click();
    await expect(page.getByText('Select an available time')).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(320);
  });
});
