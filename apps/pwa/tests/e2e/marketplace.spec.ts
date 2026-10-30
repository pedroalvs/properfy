import { test, expect, type Page } from '@playwright/test';
import { stubJson } from './support/api';
import { loginAsInspector } from './support/auth';
import { isWideProject } from './support/projects';
import { OFFER, OFFER_DETAIL } from './support/fixtures';

/**
 * The offers list is served as `{ data, pagination }` and the request carries
 * `?page&pageSize`; `stubJson` matches by pathname, so the query is handled.
 *
 * Both layouts share `OfferCard` and `GroupDetailContent`: the phone feed and the
 * wide (`marketplace-extended`) accordion render the same card and detail body. The
 * only divergence is the detail *container* — a bottom sheet (`group-detail-sheet`)
 * on phone vs. an inline accordion panel on wide — so only that sheet assertion is
 * gated by `isWideProject` (L-X03-07, Direction D / two-pane drift).
 */
test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsInspector(page);
  });

  async function stubOffers(page: Page, offers: unknown[]) {
    await stubJson(page, '/v1/marketplace/offers', {
      data: offers,
      pagination: { page: 1, pageSize: 100, total: offers.length, totalPages: 1 },
    });
  }

  test('shows marketplace with offers', async ({ page }) => {
    await stubOffers(page, [OFFER]);

    await page.goto('/marketplace');
    await expect(page.getByTestId('marketplace-page')).toBeVisible();
    const card = page.getByTestId(`offer-card-${OFFER.groupId}`);
    await expect(card).toBeVisible();
    await expect(card.getByText('Routine Inspection')).toBeVisible();
    await expect(card.getByText('3 inspections')).toBeVisible();
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
  test('group detail shows per-job addresses and the group total', async ({ page }, testInfo) => {
    await stubOffers(page, [OFFER]);
    await stubJson(page, `/v1/marketplace/offers/${OFFER.groupId}`, { data: OFFER_DETAIL });

    await page.goto('/marketplace');
    await page.getByTestId('view-detail-button').first().click();

    // Phone opens the bottom sheet; wide expands an inline accordion panel instead.
    if (!isWideProject(testInfo)) {
      await expect(page.getByTestId('group-detail-sheet')).toBeVisible();
    }

    // The shared detail body (GroupDetailContent) is present in both layouts.
    const addresses = page.getByTestId('appointment-address');
    await expect(addresses).toHaveCount(2);
    await expect(addresses.first()).toHaveText(/12 Ocean St, Brunswick VIC/);
    await expect(page.getByTestId('appointment-property-type-icon')).toHaveCount(2);
    await expect(page.getByTestId('group-total-payout')).toHaveText(/240/);
  });

  test('shows empty state when no offers', async ({ page }) => {
    await stubOffers(page, []);

    await page.goto('/marketplace');
    // Both the phone feed and the wide accordion render this copy; take the first.
    await expect(page.getByText('No offers available').first()).toBeVisible();
  });
});
