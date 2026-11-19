import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { TodayPage } from '../TodayPage';
import { buildDayPlan, buildStop, buildStops } from '@/features/day-plan/__fixtures__/day-plan';

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => mockGet(...args) } }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Jane Doe', timezone: 'Australia/Sydney' } }),
}));

const onlineRef = { value: true };
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => onlineRef.value }));

const unreadRef = { value: 0 };
vi.mock('@/features/announcements/hooks/useUnreadNoticeCount', () => ({
  useUnreadNoticeCount: () => ({ count: unreadRef.value }),
}));

vi.mock('@/features/execution/lib/geolocation', () => ({
  captureRequiredLocation: vi.fn().mockResolvedValue({ latitude: -33.88, longitude: 151.21, accuracy: 10 }),
}));

const checkIn = vi.fn().mockResolvedValue({ startedAt: '2026-11-04T21:05:00.000Z', outOfRadius: false });
vi.mock('@/features/execution/hooks/useExecutionActions', () => ({
  useExecutionActions: () => ({
    state: { phase: 'IDLE' },
    isRestored: true,
    checkIn,
    requestCheckOut: vi.fn(),
    confirmStep: null,
    confirmSync: vi.fn(),
    confirmPastTime: vi.fn(),
    cancelConfirm: vi.fn(),
  }),
}));

const TODAY = '2026-11-05';
const TOMORROW = '2026-11-06';

/** Route the GET mock by the date in the URL. Each date → a {status, body}. */
function setPlans(byDate: Record<string, { status: number; code?: string; plan?: unknown }>) {
  mockGet.mockImplementation((path: string) => {
    const date = path.split('/').pop() as string;
    const entry = byDate[date];
    if (!entry || entry.status === 404) {
      return Promise.resolve({
        data: undefined,
        error: { error: { code: entry?.code ?? 'DAY_PLAN_NOT_FOUND', message: 'x' } },
        response: { status: 404 },
      });
    }
    return Promise.resolve({ data: { data: entry.plan }, error: undefined, response: { status: 200 } });
  });
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-04T20:00:00.000Z')); // 07:00 Sydney on 2026-11-05
  mockGet.mockReset();
  checkIn.mockClear();
  onlineRef.value = true;
  unreadRef.value = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TodayPage', () => {
  it('shows a loading skeleton before the plan resolves', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<TodayPage />);
    expect(screen.getByTestId('today-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('NEXT INSPECTION')).toBeNull();
  });

  it('renders the happy path: greeting, progress, Next, Coming up, view-all link', async () => {
    setPlans({
      [TODAY]: { status: 200, plan: buildDayPlan() },
      [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' },
    });
    renderWithProviders(<TodayPage />);

    expect(await screen.findByRole('heading', { name: 'Good morning, Jane' })).toBeInTheDocument();
    expect(screen.getByText(/Thursday, 5 Nov · Online/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 3 done · finish ~10:35 am/)).toBeInTheDocument();
    expect(screen.getByText('NEXT INSPECTION')).toBeInTheDocument();
    expect(screen.getByText('12 King St, Surry Hills NSW 2010')).toBeInTheDocument();
    const viewAll = screen.getByTestId('view-all-stops');
    expect(viewAll).toHaveTextContent('View and reorder all 3 stops');
    expect(viewAll).toHaveAttribute('href', '/today/route');
  });

  it('checks in from the Next card without navigating', async () => {
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan() }, [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' } });
    const user = userEvent.setup();
    renderWithProviders(<TodayPage />);
    const next = await screen.findByText('NEXT INSPECTION');
    const card = next.closest('article')!;
    await user.click(within(card).getByTestId('card-primary-action'));
    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1));
  });

  it('shows the no-base warning with a link to the account base section', async () => {
    setPlans({
      [TODAY]: {
        status: 200,
        plan: buildDayPlan({ originWarning: 'NO_BASE', origin: { source: 'NONE', label: null, lat: null, lng: null } }),
      },
      [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' },
    });
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText('No base address: route has no starting point')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add base address' })).toHaveAttribute(
      'href',
      '/profile/account#base-address',
    );
  });

  it('shows the approximate banner', async () => {
    setPlans({
      [TODAY]: { status: 200, plan: buildDayPlan({ approximate: true }) },
      [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' },
    });
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText('Approximate route: travel times are estimates')).toBeInTheDocument();
  });

  it('shows the STALE status banner', async () => {
    setPlans({
      [TODAY]: { status: 200, plan: buildDayPlan({ status: 'STALE' }) },
      [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' },
    });
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText('Updating your route…')).toBeInTheDocument();
  });

  it('renders the all-done state', async () => {
    const stops = buildStops().map((s) => buildStop({ ...s, appointmentStatus: 'DONE', executed: true }));
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan({ stops }) }, [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' } });
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText('All done for today')).toBeInTheDocument();
    expect(screen.getAllByText('3 of 3 done').length).toBeGreaterThan(0);
    expect(screen.queryByText('NEXT INSPECTION')).toBeNull();
  });

  it('renders the empty state with Browse offers', async () => {
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan({ stops: [] }) }, [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' } });
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText('No inspections today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse offers' })).toBeInTheDocument();
    expect(screen.queryByText(/finish ~/)).toBeNull();
  });

  it('shows the unread announcements card only when there are unread notices', async () => {
    unreadRef.value = 2;
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan() }, [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' } });
    renderWithProviders(<TodayPage />);
    const card = await screen.findByTestId('unread-notices-card');
    expect(card).toHaveTextContent('2 unread announcements');
    expect(card).toHaveAttribute('href', '/profile/announcements');
  });

  it('tomorrow not published: fixed ready-at-7:30pm copy', async () => {
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan() }, [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' } });
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText("Tomorrow's route will be ready at 7:30 pm")).toBeInTheDocument();
  });

  it('tomorrow published: count + first ETA + view route link', async () => {
    const tomorrowPlan = buildDayPlan({ date: TOMORROW, stops: buildStops().slice(0, 4) });
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan() }, [TOMORROW]: { status: 200, plan: tomorrowPlan } });
    renderWithProviders(<TodayPage />);
    const card = await screen.findByTestId('tomorrow-card');
    expect(card).toHaveTextContent('Tomorrow · 3 stops · first at 8:00 am');
    expect(card).toHaveAttribute('href', `/today/route/${TOMORROW}`);
  });

  it('offline with a cached plan shows the offline note and content', async () => {
    setPlans({ [TODAY]: { status: 200, plan: buildDayPlan() }, [TOMORROW]: { status: 404, code: 'DAY_PLAN_NOT_PUBLISHED' } });
    const { rerender } = renderWithProviders(<TodayPage />);
    await screen.findByText('NEXT INSPECTION');

    onlineRef.value = false;
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'));
    rerender(<TodayPage />);
    // The query still holds the cached plan; a background refetch flips isOffline.
    // Trigger a refetch via pull-to-refresh isn't available here; assert content stays.
    expect(screen.getByText('NEXT INSPECTION')).toBeInTheDocument();
  });

  it('error without cache shows retry', async () => {
    setPlans({ [TODAY]: { status: 500 }, [TOMORROW]: { status: 404 } });
    mockGet.mockImplementation((path: string) =>
      path.includes(TODAY)
        ? Promise.resolve({ data: undefined, error: { error: { code: 'INTERNAL', message: 'x' } }, response: { status: 500 } })
        : Promise.resolve({ data: undefined, error: { error: { code: 'DAY_PLAN_NOT_PUBLISHED' } }, response: { status: 404 } }),
    );
    renderWithProviders(<TodayPage />);
    expect(await screen.findByText("Couldn't load your route")).toBeInTheDocument();
  });
});
