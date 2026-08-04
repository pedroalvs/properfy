import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const TOKEN = 'test-portal-token';

/**
 * A confirmed inspection. Served through page.route so the spec needs no live portal
 * token — minting a real one has four independent preconditions on the appointment.
 */
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
    rentalTenantConfirmationStatus: 'CONFIRMED',
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

async function mockPortalData(page: Page, overrides: Partial<typeof portalData> = {}) {
  await page.route(`**/v1/rental-tenant-portal/${TOKEN}`, async (route) => {
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

test.describe('rental tenant portal — add to calendar', () => {
  test('offers all three calendar targets on a confirmed inspection', async ({ page }) => {
    await mockPortalData(page);
    await page.goto(`/portal/${TOKEN}`);

    const section = page.getByRole('region', { name: 'Add to calendar' });
    await expect(section).toBeVisible();
    await expect(section.getByRole('button', { name: /download/i })).toBeVisible();
    await expect(section.getByRole('link', { name: /google calendar/i })).toBeVisible();
    await expect(section.getByRole('link', { name: /outlook/i })).toBeVisible();
  });

  test('links to Google Calendar with the slot resolved to UTC', async ({ page }) => {
    await mockPortalData(page);
    await page.goto(`/portal/${TOKEN}`);

    const href = await page
      .getByRole('link', { name: /google calendar/i })
      .getAttribute('href');
    const url = new URL(href ?? '');

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    // 1 Jun 2099 09:00–12:00 in Sydney is AEST (UTC+10) -> 23:00 the previous day.
    expect(url.searchParams.get('dates')).toBe('20990531T230000Z/20990601T020000Z');
    expect(url.searchParams.get('location')).toContain('Surry Hills');
  });

  test('downloads a valid .ics file', async ({ page }) => {
    await mockPortalData(page);
    await page.goto(`/portal/${TOKEN}`);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download/i }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('inspection-ACM-PROP-0007.ics');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const content = Buffer.concat(chunks).toString('utf8');

    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('DTSTART:20990531T230000Z');
    expect(content).toContain('DTEND:20990601T020000Z');
    expect(content).toContain('END:VCALENDAR');
    // Every line must fit RFC 5545's 75-octet limit once folded.
    for (const line of content.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  test('is not offered while the response is still pending', async ({ page }) => {
    await mockPortalData(page, {
      appointment: {
        ...portalData.appointment,
        rentalTenantConfirmationStatus: 'PENDING',
      },
    });
    await page.goto(`/portal/${TOKEN}`);

    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Add to calendar' })).toHaveCount(0);
  });

  test('renders the actions stacked and tappable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockPortalData(page);
    await page.goto(`/portal/${TOKEN}`);

    const download = page.getByRole('button', { name: /download/i });
    await expect(download).toBeVisible();

    const box = await download.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // Nothing may overflow the viewport horizontally on mobile.
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  });
});
