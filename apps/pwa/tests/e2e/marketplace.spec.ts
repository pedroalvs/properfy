import { test, expect } from '@playwright/test';

/**
 * The offers list is served as `{ data, pagination }` (see
 * `paginatedResponseSchema(marketplaceOfferResponseSchema)`), and the request
 * carries `?page&pageSize`, so the route glob needs the trailing wildcard.
 * These stubs previously used a `{ offers, totalCount }` shape that no endpoint
 * has ever returned, and the specs failed silently — the PWA e2e suite is not
 * wired into CI.
 */
const OFFER = {
  groupId: 'group-1',
  groupNumber: 1057,
  code: '1057',
  tenantName: 'Acme Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 3,
  scheduledDate: '2026-03-20',
  timeWindow: '09:00-11:00',
  suburbs: ['Brunswick', 'Fitzroy'],
  payoutEstimate: 240,
  appointmentCount: 3,
  centroid: null,
  properties: [
    { street: '12 Ocean St', suburb: 'Brunswick VIC', propertyType: 'APARTMENT' },
    { street: '3 Beach Rd', suburb: 'Fitzroy VIC', propertyType: 'HOUSE' },
    { street: '7 Hill St', suburb: 'Fitzroy VIC', propertyType: 'HOUSE' },
  ],
};

const OFFER_DETAIL = {
  ...OFFER,
  addresses: ['12 Ocean St, Brunswick VIC', '3 Beach Rd, Fitzroy VIC'],
  keyRequired: false,
  notes: null,
  appointments: [
    {
      id: '00000000-0000-0000-0000-000000000011',
      appointmentCode: 'INS-1001',
      appointmentNumber: 1001,
      suburb: 'Brunswick VIC',
      keyRequired: false,
      notes: null,
      payoutAmount: 80,
      tenantName: 'Acme Realty',
      timeSlotStart: '09:00',
      timeSlotEnd: '10:00',
      street: '12 Ocean St',
      coordinates: null,
      propertyType: 'APARTMENT',
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      appointmentCode: 'INS-1002',
      appointmentNumber: 1002,
      suburb: 'Fitzroy VIC',
      keyRequired: false,
      notes: null,
      payoutAmount: 160,
      tenantName: 'Acme Realty',
      timeSlotStart: '10:30',
      timeSlotEnd: '11:30',
      street: '3 Beach Rd',
      coordinates: null,
      propertyType: 'HOUSE',
    },
  ],
};

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('refresh_token', 'test-refresh');
    });

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

    // Mock schedule for nav
    await page.route('**/v1/inspector/schedule/range**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      });
    });
  });

  async function stubOffers(page: import('@playwright/test').Page, offers: unknown[]) {
    await page.route('**/v1/marketplace/offers*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: offers,
          pagination: { page: 1, pageSize: 100, total: offers.length, totalPages: 1 },
        }),
      });
    });
  }

  test('shows marketplace with offers', async ({ page }) => {
    await stubOffers(page, [OFFER]);

    await page.goto('/marketplace');
    await expect(page.getByTestId('marketplace-page')).toBeVisible();
    await expect(page.getByTestId('offer-card-group-1')).toBeVisible();
    await expect(page.getByText('Routine Inspection')).toBeVisible();
    await expect(page.getByText('3 inspections')).toBeVisible();
  });

  // Doc §7.2: the card carries a full street address and a property-type icon.
  test('offer card shows a full address, the remainder count and type icons', async ({ page }) => {
    await stubOffers(page, [OFFER]);

    await page.goto('/marketplace');
    await expect(page.getByTestId('offer-address')).toHaveText(/12 Ocean St, Brunswick VIC/);
    await expect(page.getByTestId('offer-address-more')).toHaveText('+2 more addresses');
    await expect(page.getByTestId('property-type-icon')).toHaveCount(2);
  });

  // Doc §7.2: the offer detail shows every address and the group's total value.
  test('group detail sheet shows per-job addresses and the group total', async ({ page }) => {
    await stubOffers(page, [OFFER]);
    await page.route(`**/v1/marketplace/offers/${OFFER.groupId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: OFFER_DETAIL }),
      });
    });

    await page.goto('/marketplace');
    await page.getByTestId('view-detail-button').first().click();

    await expect(page.getByTestId('group-detail-sheet')).toBeVisible();
    const addresses = page.getByTestId('appointment-address');
    await expect(addresses).toHaveCount(2);
    await expect(addresses.first()).toHaveText(/12 Ocean St, Brunswick VIC/);
    await expect(page.getByTestId('appointment-property-type-icon')).toHaveCount(2);
    await expect(page.getByTestId('group-total-payout')).toHaveText(/240/);
  });

  test('shows empty state when no offers', async ({ page }) => {
    await stubOffers(page, []);

    await page.goto('/marketplace');
    await expect(page.getByText('No offers available')).toBeVisible();
  });
});
