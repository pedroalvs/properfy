import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { SchedulePage } from '../SchedulePage';

vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

// Force an install banner to render so the base banner's position relative to it
// can be asserted.
vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => ({ isIosSafariEligible: false, canInstall: true }),
}));

vi.mock('../../components/InstallBannerNative', () => ({
  InstallBannerNative: () => <div data-testid="install-native" />,
}));
vi.mock('../../components/InstallBannerIos', () => ({
  InstallBannerIos: () => <div data-testid="install-ios" />,
}));
vi.mock('../../components/ScheduleOfflineBanner', () => ({
  ScheduleOfflineBanner: () => null,
}));
vi.mock('@/features/execution/components/FailedSyncBanner', () => ({
  FailedSyncBanner: () => null,
}));

vi.mock('../../hooks/useScheduleMonth', () => ({
  useScheduleMonth: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useScheduleHistory', () => ({
  useScheduleHistory: () => ({
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));

const mockUseInspectorMe = vi.fn();
vi.mock('@/features/profile/hooks/useInspectorMe', () => ({
  useInspectorMe: () => mockUseInspectorMe(),
}));

describe('SchedulePage — base-address banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the banner above the install banner when the base has no coordinates', () => {
    mockUseInspectorMe.mockReturnValue({
      data: { data: { id: 'insp-1', address: null, baseLat: null } },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<SchedulePage />);

    const banner = screen.getByText('Add your base address');
    const install = screen.getByTestId('install-native');
    // The base banner must come before the install banner in document order.
    expect(banner.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The schedule stays interactive (its tabs are present).
    expect(screen.getByRole('tab', { name: /upcoming/i })).toBeInTheDocument();
  });

  it('does not render the banner once the base is located', () => {
    mockUseInspectorMe.mockReturnValue({
      data: { data: { id: 'insp-1', address: { street: 'x' }, baseLat: -33.8 } },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<SchedulePage />);
    expect(screen.queryByText('Add your base address')).not.toBeInTheDocument();
  });
});
