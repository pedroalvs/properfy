import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { MarketplacePage } from '../MarketplacePage';
import type { MarketplaceOffer } from '../../types';

const mockUseMarketplaceOffers = vi.fn();
const mockUseIsOnline = vi.fn();

vi.mock('@/features/offers/hooks/useMarketplaceOffers', () => ({
  useMarketplaceOffers: () => mockUseMarketplaceOffers(),
}));

vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockUseIsOnline(),
}));

vi.mock('@/components/shell/TopBar', () => ({
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/features/offers/components/OfferFeed', () => ({
  OfferFeed: ({ offers }: { offers: MarketplaceOffer[] }) => (
    <div data-testid="offer-feed">{offers.map((offer) => offer.groupId).join(',')}</div>
  ),
}));

vi.mock('@/features/offers/components/OfflineMarketplaceBanner', () => ({
  OfflineMarketplaceBanner: () => <div>Offline banner</div>,
}));

describe('MarketplacePage', () => {
  beforeEach(() => {
    mockUseMarketplaceOffers.mockReset();
    mockUseIsOnline.mockReset();
  });

  it('shows cached offers while offline', () => {
    mockUseIsOnline.mockReturnValue(false);
    mockUseMarketplaceOffers.mockReturnValue({
      data: {
        data: [
          {
            groupId: 'grp-1',
            tenantName: 'Agency',
            serviceTypeName: 'Routine Inspection',
            groupSize: 1,
            scheduledDate: '2026-03-26',
            timeWindow: '09:00-11:00',
            priorityMode: 'STANDARD',
            priorityExpiresAt: null,
            suburbs: ['Brunswick'],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      dataUpdatedAt: Date.now(),
    });

    renderWithProviders(<MarketplacePage />);

    expect(screen.getByText('Offline banner')).toBeInTheDocument();
    expect(screen.getByTestId('offer-feed')).toHaveTextContent('grp-1');
  });

  it('shows error state when online fetch fails and there is no cached data', () => {
    mockUseIsOnline.mockReturnValue(true);
    mockUseMarketplaceOffers.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
      dataUpdatedAt: 0,
    });

    renderWithProviders(<MarketplacePage />);

    expect(screen.getByText('Failed to load offers')).toBeInTheDocument();
    expect(screen.queryByTestId('offer-feed')).not.toBeInTheDocument();
  });
});
