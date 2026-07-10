import { render, screen, fireEvent } from '@testing-library/react';
import { ServiceTypeFlowType } from '@properfy/shared';
import { SchedulePage } from '../SchedulePage';
import type { HistoryItem } from '../../hooks/useScheduleHistory';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('@/components/shell/TopBar', () => ({
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => ({ isIosSafariEligible: false, canInstall: false }),
}));

vi.mock('../../components/ScheduleOfflineBanner', () => ({
  ScheduleOfflineBanner: () => null,
}));

vi.mock('../../hooks/useScheduleMonth', () => ({
  useScheduleMonth: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const mockFetchNextPage = vi.fn();
const mockUseScheduleHistory = vi.fn();
vi.mock('../../hooks/useScheduleHistory', () => ({
  useScheduleHistory: (period: string, enabled: boolean) => mockUseScheduleHistory(period, enabled),
}));

const historyItem: HistoryItem = {
  id: '00000000-0000-0000-0000-000000000001',
  appointmentCode: 'INS-0001',
  status: 'DONE',
  scheduledDate: '2026-04-01',
  timeSlotStart: '08:00',
  timeSlotEnd: '12:00',
  serviceTypeId: '00000000-0000-0000-0000-000000000099',
  propertyId: '00000000-0000-0000-0000-000000000088',
  rentalTenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'FINISHED',
  agencyName: 'Test Agency',
  propertyAddress: '1 Test St',
  suburb: 'Suburbia',
  serviceTypeName: 'Routine Inspection',
  flowType: ServiceTypeFlowType.ROUTINE,
};

function makeHistoryResult(overrides: Record<string, unknown> = {}) {
  return {
    items: [historyItem],
    total: 1,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mockFetchNextPage,
    ...overrides,
  };
}

function openHistoryTab() {
  render(<SchedulePage />);
  fireEvent.click(screen.getByRole('tab', { name: /history/i }));
}

describe('SchedulePage — History tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseScheduleHistory.mockReturnValue(makeHistoryResult());
  });

  it('renders history cards inside the History tab', () => {
    openHistoryTab();
    expect(screen.getByTestId(`appointment-card-${historyItem.id}`)).toBeInTheDocument();
  });

  it('defaults to the 24m period and switches on filter tap', () => {
    openHistoryTab();
    expect(mockUseScheduleHistory).toHaveBeenLastCalledWith('24m', true);

    fireEvent.click(screen.getByRole('tab', { name: '30d' }));
    expect(mockUseScheduleHistory).toHaveBeenLastCalledWith('30d', true);
  });

  it('keeps the history query disabled until the History tab is opened', () => {
    render(<SchedulePage />);
    expect(mockUseScheduleHistory).toHaveBeenLastCalledWith('24m', false);

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    expect(mockUseScheduleHistory).toHaveBeenLastCalledWith('24m', true);
  });

  it('auto-fetches the next page when the sentinel intersects', () => {
    const observed: Element[] = [];
    let intersectionCallback: IntersectionObserverCallback = () => {};
    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    try {
      mockUseScheduleHistory.mockReturnValue(makeHistoryResult({ hasNextPage: true }));
      openHistoryTab();

      expect(observed).toHaveLength(1);
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      expect(mockFetchNextPage).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows Load more when another page exists and fetches it on tap', () => {
    mockUseScheduleHistory.mockReturnValue(makeHistoryResult({ hasNextPage: true }));
    openHistoryTab();

    const loadMore = screen.getByRole('button', { name: /load more/i });
    fireEvent.click(loadMore);
    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('hides Load more while the next page is being fetched', () => {
    mockUseScheduleHistory.mockReturnValue(
      makeHistoryResult({ hasNextPage: true, isFetchingNextPage: true }),
    );
    openHistoryTab();

    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
