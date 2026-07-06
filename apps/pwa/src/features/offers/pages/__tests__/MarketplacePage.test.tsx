import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { MarketplacePage } from '../MarketplacePage';
import type { MarketplaceOffer } from '../../types';

const mockUseMarketplaceOffers = vi.fn();
const mockUseIsOnline = vi.fn();
const mockAccept = vi.fn();
const mockGetState = vi.fn();

vi.mock('@/features/offers/hooks/useAcceptOffer', () => ({
  useAcceptOffer: () => ({
    getState: mockGetState,
    startConfirm: vi.fn(),
    cancelConfirm: vi.fn(),
    accept: mockAccept,
  }),
}));

vi.mock('@/features/offers/components/GroupDetailBottomSheet', () => ({
  GroupDetailBottomSheet: ({
    groupId,
    onAccept,
    accepting,
  }: {
    groupId: string | null;
    onAccept?: () => void;
    accepting?: boolean;
  }) =>
    groupId ? (
      <div data-testid="detail-sheet" data-accepting={accepting ? 'true' : 'false'}>
        {onAccept && (
          <button data-testid="sheet-accept" onClick={onAccept}>
            Accept group
          </button>
        )}
      </div>
    ) : null,
}));

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
  OfferFeed: ({
    offers,
    onViewDetail,
  }: {
    offers: MarketplaceOffer[];
    onViewDetail?: (groupId: string) => void;
  }) => (
    <div data-testid="offer-feed">
      {offers.map((offer) => offer.groupId).join(',')}
      {offers[0] && onViewDetail && (
        <button data-testid="view-detail" onClick={() => onViewDetail(offers[0].groupId)}>
          View
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/features/offers/components/OfflineMarketplaceBanner', () => ({
  OfflineMarketplaceBanner: () => <div>Offline banner</div>,
}));

describe('MarketplacePage', () => {
  beforeEach(() => {
    mockUseMarketplaceOffers.mockReset();
    mockUseIsOnline.mockReset();
    mockAccept.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue('IDLE');
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

  it('awaits accept before closing the detail sheet and passes accepting state', async () => {
    mockUseIsOnline.mockReturnValue(true);
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
    let resolveAccept!: (state: string) => void;
    mockAccept.mockImplementation(() => new Promise<string>((resolve) => { resolveAccept = resolve; }));
    mockGetState.mockReturnValue('ACCEPTING');
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);

    await user.click(screen.getByTestId('view-detail'));
    const sheet = screen.getByTestId('detail-sheet');
    expect(sheet).toHaveAttribute('data-accepting', 'true');

    await user.click(screen.getByTestId('sheet-accept'));
    expect(mockAccept).toHaveBeenCalledWith('grp-1');
    // Sheet stays open until accept resolves
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();

    resolveAccept('ACCEPTED');
    await waitFor(() => expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument());
  });

  it('keeps the detail sheet open when accept resolves with a retryable failure', async () => {
    mockUseIsOnline.mockReturnValue(true);
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
    mockAccept.mockResolvedValue('ERROR');
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await user.click(screen.getByTestId('view-detail'));
    await user.click(screen.getByTestId('sheet-accept'));

    expect(mockAccept).toHaveBeenCalledWith('grp-1');
    await waitFor(() => expect(screen.getByTestId('detail-sheet')).toBeInTheDocument());
  });
});
