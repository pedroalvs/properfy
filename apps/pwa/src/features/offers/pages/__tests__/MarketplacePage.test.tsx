import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { MarketplacePage } from '../MarketplacePage';
import type { MarketplaceOffer } from '../../types';

const mockUseMarketplaceOffers = vi.fn();
const mockUseIsOnline = vi.fn();
const mockAccept = vi.fn();
const mockGetState = vi.fn();
const mockUseOfferDetail = vi.fn();
const mockShowInfo = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/features/offers/hooks/useMarketplaceOfferDetail', () => ({
  useMarketplaceOfferDetail: (groupId: string | null) => mockUseOfferDetail(groupId),
}));

// Keep the real SnackbarProvider (used by renderWithProviders) but spy on the hook.
vi.mock('@/hooks/useSnackbar', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSnackbar: () => ({
      messages: [],
      showSuccess: vi.fn(),
      showError: mockShowError,
      showInfo: mockShowInfo,
      dismiss: vi.fn(),
    }),
  };
});

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

// Builds the useMarketplaceOffers return in its infinite-query shape.
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
    mockUseOfferDetail.mockReset();
    mockUseOfferDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockShowInfo.mockReset();
    mockShowError.mockReset();
  });

  it('shows cached offers while offline', () => {
    mockUseIsOnline.mockReturnValue(false);
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([
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
        } as unknown as MarketplaceOffer,
      ]),
    );

    renderWithProviders(<MarketplacePage />);

    expect(screen.getByText('Offline banner')).toBeInTheDocument();
    expect(screen.getByTestId('offer-feed')).toHaveTextContent('grp-1');
  });

  it('shows error state when online fetch fails and there is no cached data', () => {
    mockUseIsOnline.mockReturnValue(true);
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([], { isError: true, dataUpdatedAt: 0 }),
    );

    renderWithProviders(<MarketplacePage />);

    expect(screen.getByText('Failed to load offers')).toBeInTheDocument();
    expect(screen.queryByTestId('offer-feed')).not.toBeInTheDocument();
  });

  it('awaits accept before closing the detail sheet and passes accepting state', async () => {
    mockUseIsOnline.mockReturnValue(true);
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([
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
        } as unknown as MarketplaceOffer,
      ]),
    );
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
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([
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
        } as unknown as MarketplaceOffer,
      ]),
    );
    mockAccept.mockResolvedValue('ERROR');
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await user.click(screen.getByTestId('view-detail'));
    await user.click(screen.getByTestId('sheet-accept'));

    expect(mockAccept).toHaveBeenCalledWith('grp-1');
    await waitFor(() => expect(screen.getByTestId('detail-sheet')).toBeInTheDocument());
  });
});

describe('MarketplacePage — map group drill-down', () => {
  const offer = {
    groupId: 'grp-1',
    groupNumber: 2042,
    code: '2042',
    tenantName: 'Agency',
    serviceTypeName: 'Routine Inspection',
    groupSize: 2,
    scheduledDate: '2026-08-01',
    timeWindow: '09:00-11:00',
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    suburbs: ['Brunswick'],
    payoutEstimate: 200,
    appointmentCount: 2,
    centroid: { lat: -33.87, lng: 151.21 },
  };

  const detailData = {
    code: '2042',
    appointmentCount: 2,
    appointments: [
      {
        id: '00000000-0000-0000-0000-00000000a001',
        street: '10 Main St',
        suburb: 'Sydney NSW',
        timeSlotStart: '08:00',
        timeSlotEnd: '09:00',
        coordinates: { lat: -33.8688, lng: 151.2093 },
      },
      {
        id: '00000000-0000-0000-0000-00000000a002',
        street: '20 Beach Rd',
        suburb: 'Bondi NSW',
        timeSlotStart: '10:00',
        timeSlotEnd: '11:00',
        coordinates: null,
      },
    ],
  };

  function mockOffers(offers = [offer]) {
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn(offers as unknown as MarketplaceOffer[]),
    );
  }

  function mockDetailResolved() {
    mockUseOfferDetail.mockImplementation((groupId: string | null) =>
      groupId
        ? { data: detailData, isLoading: false, isError: false }
        : { data: undefined, isLoading: false, isError: false },
    );
  }

  async function openMapAndExpand(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('tab', { name: 'Map' }));
    await user.click(screen.getByTestId('map-select-offer'));
  }

  beforeEach(() => {
    mockUseMarketplaceOffers.mockReset();
    mockAccept.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue('IDLE');
    mockUseOfferDetail.mockReset();
    mockUseOfferDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockShowInfo.mockReset();
    mockShowError.mockReset();
    mockUseIsOnline.mockReset();
    mockUseIsOnline.mockReturnValue(true);
  });

  it('selecting a map pin expands the group and shows the action bar (Accept disabled while the detail loads)', async () => {
    mockOffers();
    mockUseOfferDetail.mockImplementation((groupId: string | null) =>
      groupId
        ? { data: undefined, isLoading: true, isError: false }
        : { data: undefined, isLoading: false, isError: false },
    );
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);

    const bar = screen.getByTestId('map-group-action-bar');
    expect(bar).toHaveTextContent('Group 2042');
    expect(bar).toHaveTextContent('Loading inspections…');
    expect(screen.getByTestId('map-accept-group-btn')).toBeDisabled();
    // Pins only swap once the detail arrives.
    expect(screen.getByTestId('map-view')).toHaveAttribute('data-expanded', '');
  });

  it('passes the expanded group with detail appointments to the map once loaded', async () => {
    mockOffers();
    mockDetailResolved();
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);

    expect(screen.getByTestId('map-view')).toHaveAttribute('data-expanded', 'grp-1');
    expect(screen.getByTestId('map-group-action-bar')).toHaveTextContent('2 inspections');
  });

  it('Reset collapses the expansion and restores the offers map', async () => {
    mockOffers();
    mockDetailResolved();
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);

    await user.click(screen.getByTestId('map-reset-btn'));
    expect(screen.queryByTestId('map-group-action-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toHaveAttribute('data-expanded', '');
  });

  it('Accept group opens the detail sheet for the expanded group, and a successful accept clears both', async () => {
    mockOffers();
    mockDetailResolved();
    mockAccept.mockResolvedValue('ACCEPTED');
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);

    await user.click(screen.getByTestId('map-accept-group-btn'));
    expect(screen.getByTestId('detail-sheet')).toBeInTheDocument();

    await user.click(screen.getByTestId('sheet-accept'));
    expect(mockAccept).toHaveBeenCalledWith('grp-1');
    await waitFor(() => {
      expect(screen.queryByTestId('detail-sheet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('map-group-action-bar')).not.toBeInTheDocument();
    });
  });

  it('auto-resets with a snackbar when the expanded group disappears from the offers list', async () => {
    mockOffers();
    mockDetailResolved();
    const user = userEvent.setup();

    const { rerender } = renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);
    expect(screen.getByTestId('map-group-action-bar')).toBeInTheDocument();

    mockOffers([]);
    rerender(<MarketplacePage />);

    await waitFor(() => {
      expect(mockShowInfo).toHaveBeenCalledWith('This group is no longer available');
      expect(screen.queryByTestId('map-group-action-bar')).not.toBeInTheDocument();
    });
  });

  it('auto-resets with an error snackbar when the group detail fails to load', async () => {
    mockOffers();
    mockUseOfferDetail.mockImplementation((groupId: string | null) =>
      groupId
        ? { data: undefined, isLoading: false, isError: true }
        : { data: undefined, isLoading: false, isError: false },
    );
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to load group inspections');
      expect(screen.queryByTestId('map-group-action-bar')).not.toBeInTheDocument();
    });
  });

  it('switching back to the list view clears the expansion', async () => {
    mockOffers();
    mockDetailResolved();
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    await openMapAndExpand(user);
    expect(screen.getByTestId('map-group-action-bar')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'List' }));
    await user.click(screen.getByRole('tab', { name: 'Map' }));

    expect(screen.queryByTestId('map-group-action-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-view')).toHaveAttribute('data-expanded', '');
  });
});

describe('MarketplacePage — offers pagination', () => {
  const baseOffer = {
    groupId: 'grp-1',
    tenantName: 'Agency',
    serviceTypeName: 'Routine Inspection',
    groupSize: 1,
    scheduledDate: '2026-08-01',
    timeWindow: '09:00-11:00',
    priorityMode: 'STANDARD',
    priorityExpiresAt: null,
    suburbs: ['Brunswick'],
  } as unknown as MarketplaceOffer;

  beforeEach(() => {
    mockUseMarketplaceOffers.mockReset();
    mockUseIsOnline.mockReset();
    mockUseIsOnline.mockReturnValue(true);
    mockUseOfferDetail.mockReset();
    mockUseOfferDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('shows a Load more button in list view while more pages exist', async () => {
    const fetchNextPage = vi.fn();
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([baseOffer], { hasNextPage: true, fetchNextPage, total: 45 }),
    );
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);

    const loadMore = screen.getByTestId('offers-load-more');
    await user.click(loadMore);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('hides Load more when every page is loaded', () => {
    mockUseMarketplaceOffers.mockReturnValue(offersHookReturn([baseOffer]));
    renderWithProviders(<MarketplacePage />);
    expect(screen.queryByTestId('offers-load-more')).not.toBeInTheDocument();
  });

  it('drains the remaining pages automatically when the map view is active', async () => {
    const fetchNextPage = vi.fn();
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([baseOffer], { hasNextPage: true, fetchNextPage }),
    );
    const user = userEvent.setup();

    renderWithProviders(<MarketplacePage />);
    expect(fetchNextPage).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Map' }));
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it('renders the backend total in the header, not just the loaded count', () => {
    mockUseMarketplaceOffers.mockReturnValue(
      offersHookReturn([baseOffer], { hasNextPage: true, total: 45 }),
    );
    renderWithProviders(<MarketplacePage />);
    expect(screen.getByText(/45 available offers/)).toBeInTheDocument();
  });
});
