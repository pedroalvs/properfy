import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { api } from '@/services/api';
import { ChallengesPage } from '../ChallengesPage';
import type { InspectorProgramResponse } from '@properfy/shared';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
const mockGet = api.GET as ReturnType<typeof vi.fn>;

function baseProgram(overrides: Partial<InspectorProgramResponse> = {}): InspectorProgramResponse {
  return {
    generatedAt: '2026-11-08T21:00:00.000Z',
    timezone: 'Australia/Sydney',
    summary: { openCashTotal: 110, currency: 'AUD' },
    activeGoals: [
      {
        goalId: 'g-volume', title: 'Weekly volume', description: 'Complete 60 inspections',
        metric: 'VOLUME', comparator: 'GTE', target: 60, periodType: 'WEEKLY',
        periodStart: '2026-11-02', periodEnd: '2026-11-08', daysLeft: 2, rewardAmount: 60,
        value: 47, serviceCount: 47, minimumServices: null, state: 'IN_PROGRESS',
        startsOn: null, countsSince: '2026-11-04',
      },
      {
        goalId: 'g-upcoming', title: 'On-time arrival', description: 'Punctuality at least 95%',
        metric: 'PUNCTUALITY', comparator: 'GTE', target: 95, periodType: 'WEEKLY',
        periodStart: '2026-11-16', periodEnd: '2026-11-22', daysLeft: 7, rewardAmount: 50,
        value: null, serviceCount: 0, minimumServices: 10, state: 'UPCOMING',
        startsOn: '2026-11-16', countsSince: null,
      },
    ],
    standing: {
      index: { score: 88.3, status: 'SCORED', snapshotDate: '2026-11-08' },
      level: 'GOLD',
      streak: { cycle: 'WEEKLY', count: 3, atRisk: true },
    },
    awards: [
      {
        goalTitle: 'Weekly volume', metric: 'VOLUME', periodType: 'WEEKLY', periodStart: '2026-11-02',
        periodEnd: '2026-11-08', amount: 60, achievedValue: 61, status: 'PENDING', paidAt: null,
        voidedAt: null, inspectorNote: null,
      },
      {
        goalTitle: 'Region volume', metric: 'REGION_VOLUME', periodType: 'WEEKLY', periodStart: '2026-10-26',
        periodEnd: '2026-11-01', amount: 40, achievedValue: 20, status: 'VOID', paidAt: null,
        voidedAt: '2026-11-03T00:00:00.000Z', inspectorNote: 'The job was cancelled by the agency.',
      },
    ],
    ranking: {
      myPosition: 4, myScore: 88.3, totalRanked: 37, notRankedReason: null, cohortTooSmall: false,
      entries: [
        { position: 1, score: 96.4, level: 'GOLD', isMe: false },
        { position: 4, score: 88.3, level: 'GOLD', isMe: true },
      ],
    },
    ...overrides,
  };
}

function mockProgram(program: InspectorProgramResponse) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/v1/inspector/program') return { data: program };
    return { data: undefined, error: { error: { code: 'NOT_FOUND', message: 'x' } } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'Jane', email: 'j@test.com', role: 'INSP', tenantId: null } });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
});

describe('ChallengesPage — Active tab', () => {
  it('opens on Active with goal progress, counts-since, Starting soon and the bonus footer', async () => {
    mockProgram(baseProgram());
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges'] });

    await screen.findByText('Weekly volume');
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '47');
    expect(bar).toHaveAttribute('aria-valuemax', '60');
    expect(bar).toHaveAttribute('aria-valuetext', '47 of 60 inspections');
    expect(screen.getByText('47 of 60')).toBeInTheDocument();
    expect(screen.getByText('2 days left')).toBeInTheDocument();
    expect(screen.getByText('Counts jobs since Wed 4 Nov')).toBeInTheDocument();

    expect(screen.getByText('Starting soon')).toBeInTheDocument();
    expect(screen.getByText('Starts Mon 16 Nov')).toBeInTheDocument();

    expect(
      screen.getByText(
        "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings.",
      ),
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no goals', async () => {
    mockProgram(baseProgram({ activeGoals: [] }));
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges'] });
    await screen.findByText('No active challenges right now. New ones will show up here.');
  });
});

describe('ChallengesPage — My results tab', () => {
  it('shows standing cards, reward chips, the voided note and the pending-review reward (03.A4)', async () => {
    mockProgram(baseProgram());
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges?tab=results'] });

    await screen.findByText('88.3');
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('3 weeks in a row')).toBeInTheDocument();
    expect(screen.getByText('Reach a weekly goal today to keep it.')).toBeInTheDocument();

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText('Voided')).toBeInTheDocument();
    expect(screen.getByText('The job was cancelled by the agency.')).toBeInTheDocument();
  });

  it('shows the void fallback when there is no inspector note', async () => {
    const program = baseProgram();
    program.awards[1]!.inspectorNote = null;
    mockProgram(program);
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges?tab=results'] });
    await screen.findByText('Voided');
    expect(screen.getByText('Contact the Properfy team for details.')).toBeInTheDocument();
  });

  it('shows the empty rewards state', async () => {
    mockProgram(baseProgram({ awards: [] }));
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges?tab=results'] });
    await screen.findByText('No rewards yet. Reach a goal to earn one.');
  });
});

describe('ChallengesPage — Ranking tab (03.A3)', () => {
  it('shows own position, an anonymous leaderboard with no names, and the platform footer', async () => {
    mockProgram(baseProgram());
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges?tab=ranking'] });

    await screen.findByText("You're #4 of 37");
    const list = screen.getByRole('list');
    expect(within(list).getByText('96.4')).toBeInTheDocument();
    expect(screen.getByLabelText('Your position: 4 of 37, score 88.3')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(
      screen.getByText('Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily.'),
    ).toBeInTheDocument();
    // No inspector name/email anywhere.
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('hides the leaderboard below a cohort of 5', async () => {
    mockProgram(
      baseProgram({
        ranking: { myPosition: 3, myScore: 70, totalRanked: 4, notRankedReason: null, cohortTooSmall: true, entries: [] },
      }),
    );
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges?tab=ranking'] });
    await screen.findByText('Your score: 70.0');
    expect(screen.getByText('The ranking appears once at least 5 inspectors have a score.')).toBeInTheDocument();
    expect(screen.queryByText("You're #3 of 4")).not.toBeInTheDocument();
  });

  it('shows the not-ranked state', async () => {
    mockProgram(
      baseProgram({
        ranking: { myPosition: null, myScore: null, totalRanked: 37, notRankedReason: 'NOT_ENOUGH_DATA', cohortTooSmall: false, entries: [] },
      }),
    );
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges?tab=ranking'] });
    await screen.findByText("You're not ranked yet");
    expect(screen.getByText("You'll appear once you have 10 jobs in the last 30 days.")).toBeInTheDocument();
  });
});

describe('ChallengesPage — tab switching and states', () => {
  it('switches tabs via the tablist', async () => {
    mockProgram(baseProgram());
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges'] });
    await screen.findByText('Weekly volume');
    fireEvent.click(screen.getByRole('tab', { name: 'Ranking' }));
    await screen.findByText("You're #4 of 37");
    fireEvent.click(screen.getByRole('tab', { name: 'My results' }));
    await screen.findByText('88.3');
  });

  it('shows an error state with a retry', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: { error: { code: 'SERVER_ERROR', message: 'boom' } }, response: { status: 500 } });
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges'] });
    await screen.findByText("Couldn't load your challenges.");
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('shows the offline banner alongside cached data when the device is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });
    mockProgram(baseProgram());
    renderWithProviders(<ChallengesPage />, { initialEntries: ['/profile/challenges'] });
    await screen.findByText('Weekly volume');
    expect(screen.getByText("You're offline. Showing your last update.")).toBeInTheDocument();
  });
});
