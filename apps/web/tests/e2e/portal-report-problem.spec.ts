import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const TOKEN = 'test-portal-token';

const portalData = {
  token: {
    status: 'ACTIVE',
    isReadOnly: false,
    isPastConfirmCutoff: false,
    isExpired: false,
    canRequestNewLink: false,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  appointment: {
    id: '00000000-0000-0000-0000-000000000002',
    status: 'SCHEDULED',
    rentalTenantConfirmationStatus: 'PENDING',
    scheduledDate: '2099-06-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    serviceTypeId: 'st-1',
    serviceType: { id: 'st-1', name: 'Routine Inspection', code: 'ROUTINE' },
    property: {
      id: '00000000-0000-0000-0000-000000000003',
      propertyCode: 'ACM-PROP-0007',
      type: 'HOUSE',
      street: '12 Bourke St',
      addressLine2: null,
      suburb: 'Surry Hills',
      postcode: '2010',
      state: 'NSW',
      country: 'AU',
    },
    keyRequired: false,
    meetingLocation: null,
    notes: null,
  },
  contact: null,
  restrictions: [],
  existingResponse: null,
  agencyPhone: null,
  deadline: null,
  tenant: { name: 'Acme Realty', timezone: 'Australia/Sydney' },
};

async function mockPortal(page: Page) {
  await page.route(`**/v1/rental-tenant-portal/${TOKEN}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(portalData) });
    } else {
      await route.fallback();
    }
  });
}

test.describe('rental tenant portal — report a problem (F10-4)', () => {
  test('submits a report with two photos: upload one at a time, then the create call fires', async ({ page }) => {
    let presignCount = 0;
    const confirmedIds: string[] = [];
    let createBody: { reason?: string; photoFileIds?: string[] } | null = null;

    await mockPortal(page);

    // List starts empty.
    await page.route(`**/v1/rental-tenant-portal/${TOKEN}/property-issues`, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        createBody = req.postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'issue-1',
            reason: createBody?.reason ?? '',
            createdAt: '2099-06-01T00:00:00.000Z',
            photos: (createBody?.photoFileIds ?? []).map((id) => ({
              id,
              fileName: `${id}.jpg`,
              mime: 'image/jpeg',
              status: 'READY',
              createdAt: '2099-06-01T00:00:00.000Z',
            })),
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issues: [] }) });
      }
    });

    await page.route(`**/v1/rental-tenant-portal/${TOKEN}/property-issues/presign`, async (route) => {
      presignCount += 1;
      const fileId = `file-${presignCount}`;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          fileId,
          uploadUrl: `https://storage.test/upload/${fileId}`,
          expiresAt: '2099-06-01T00:15:00.000Z',
        }),
      });
    });

    await page.route('**/storage.test/upload/**', async (route) => {
      await route.fulfill({ status: 200, body: '' });
    });

    await page.route(`**/v1/rental-tenant-portal/${TOKEN}/property-issues/confirm-upload`, async (route) => {
      const fileId = (route.request().postDataJSON() as { fileId: string }).fileId;
      confirmedIds.push(fileId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: fileId,
          fileName: `${fileId}.jpg`,
          mime: 'image/jpeg',
          status: 'PENDING',
          createdAt: '2099-06-01T00:00:00.000Z',
        }),
      });
    });

    await page.goto(`/portal/${TOKEN}`);

    const section = page.getByRole('region', { name: 'Report a problem with the property' });
    await expect(section).toBeVisible();

    await section.getByLabel('Describe the issue').fill('The front gate will not lock');

    await page.locator('input[aria-label="Add photos"]').setInputFiles([
      { name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
      { name: 'b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
    ]);

    // Both photos upload (one at a time) and reach the Ready state.
    await expect(section.getByText('Ready')).toHaveCount(2);
    expect(presignCount).toBe(2);

    await section.getByRole('button', { name: /submit report/i }).click();

    await expect(section.getByText(/your report has been sent/i)).toBeVisible();
    expect(createBody?.reason).toBe('The front gate will not lock');
    expect(createBody?.photoFileIds).toHaveLength(2);
  });
});
