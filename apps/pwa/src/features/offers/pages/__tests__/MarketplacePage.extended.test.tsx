import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { MarketplacePage } from '../MarketplacePage';
import type { MarketplaceOffer } from '../../types';

const mockUseMarketplaceOffers = vi.fn();
const mockAccept = vi.fn();
const mockGetState = vi.fn();

vi.mock('@/features/offers/hooks/useMarketplaceOffers', () => ({
  useMarketplaceOffers: () => mockUseMarketplaceOffers(),
}));

vi.mock('@/features/offers/hooks/useMarketplaceOfferDetail', () => ({
  useMarketplaceOfferDetail: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/features/offers/hooks/useAcceptOffer', () => ({
  useAcceptOffer: () => ({
    getState: mockGetState,
    startConfirm: vi.fn(),
    cancelConfirm: vi.fn(),
    accept: mockAccept,
  }),
}));

vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => true }));

vi.mock('@/components/shell/TopBar', () => ({
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

// Map stub: exposes a pin that reports the first offer's id, and echoes the
// drill-down target so the shared selection is observable.
vi.mock('@/features/offers/components/OffersMapView', () => ({
  OffersMapView: ({
    offers,
    onSelectOffer,
    expandedGroup,
  }: {
    offers: MarketplaceOffer[];
    onSelectOffer: (groupId: string) => void;
    expandedGroup?: { groupId: string } | null;
  }) => (
    <div data-testid="map-view" data-expanded={expandedGroup?.groupId ?? ''}>
      {offers[0] && (
        <button data-testid="map-select-offer" onClick={() => onSelectOffer(offers[0].groupId)}>
          pin
        </button>
      )}
    </div>
  ),
}));

// Accordion stub: echoes the shared expanded id and surfaces toggle / accept.
vi.mock('@/features/offers/components/OfferAccordionList', () => ({
  OfferAccordionList: ({
    offers,
    expandedGroupId,
    onToggle,
    onAcceptGroup,
  }: {
    offers: MarketplaceOffer[];
    expandedGroupId: string | null;
    onToggle: (groupId: string) => void;
    onAcceptGroup: (groupId: string) => void;
  }) => (
    <div data-testid="offer-accordion" data-expanded={expandedGroupId ?? ''}>
      {offers.map((offer) => (
        <div key={offer.groupId}>
          <button data-testid={`acc-toggle-${offer.groupId}`} onClick={() => onToggle(offer.groupId)}>
            toggle
          </button>
          {expandedGroupId === offer.groupId && (
            <button data-testid={`acc-accept-${offer.groupId}`} onClick={() => onAcceptGroup(offer.groupId)}>
              accept
            </button>
          )}
        </div>
      ))}
    </div>
  ),
}));

function offersHookReturn(offers: MarketplaceOffer[], overrides: Record<string, unknown> = {}) {
  return {
    offers,
    total: offers.length,
    data: { pages: [{ data: offers }], pageParams: [1] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    dataUpdatedAt: Date.now(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

const baseOffer = {
  groupId: 'grp-1',
  tenantName: 'Agency',
  serviceTypeName: 'Routine Inspection',
  groupSize: 1,
  scheduledDate: '2026-08-01',
  timeWindow: '09:00-11:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  suburbs: ['Sydney'],
} as unknown as MarketplaceOffer;

function setWideViewport(matches = true) {
  // @ts-expect-error jsdom has no matchMedia; define it so useIsWide reports wide.
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  });
}

describe('MarketplacePage — extended layout (tablet/landscape)', () => {
  beforeEach(() => {
    mockUseMarketplaceOffers.mockReset();
    mockUseMarketplaceOffers.mockReturnValue(offersHookReturn([baseOffer]));
    mockAccept.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue('IDLE');
    setWideViewport(true);
  });

  afterEach(() => {
    // @ts-expect-error restore jsdom default (absent).
    delete window.matchMedia;
  });

  it('renders the map + accordion and hides the list/map toggle', () => {
    renderWithProviders(<MarketplacePage />);
    expect(screen.getByTestId('marketplace-extended')).toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByTestId('offer-accordion')).toBeInTheDocument();
    // The narrow List/Map toggle must not appear in the extended layout.
    expect(screen.queryByRole('tab', { name: 'Map' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'List' })).toBeNull();
  });

  it('shares one selection: tapping a map pin expands that offer in the accordion', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketplacePage />);
    expect(screen.getByTestId('offer-accordion')).toHaveAttribute('data-expanded', '');

    await user.click(screen.getByTestId('map-select-offer'));
    expect(screen.getByTestId('offer-accordion')).toHaveAttribute('data-expanded', 'grp-1');
  });

  it('toggling the same offer twice collapses it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketplacePage />);

    await user.click(screen.getByTestId('acc-toggle-grp-1'));
    expect(screen.getByTestId('offer-accordion')).toHaveAttribute('data-expanded', 'grp-1');

    await user.click(screen.getByTestId('acc-toggle-grp-1'));
    expect(screen.getByTestId('offer-accordion')).toHaveAttribute('data-expanded', '');
  });

  it('accepts a group from the accordion panel and collapses on success', async () => {
    mockAccept.mockResolvedValue('ACCEPTED');
    const user = userEvent.setup();
    renderWithProviders(<MarketplacePage />);

    await user.click(screen.getByTestId('acc-toggle-grp-1'));
    await user.click(screen.getByTestId('acc-accept-grp-1'));

    expect(mockAccept).toHaveBeenCalledWith('grp-1');
  });
});
