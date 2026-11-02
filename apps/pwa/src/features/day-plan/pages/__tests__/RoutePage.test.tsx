import { screen, within } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { RoutePage } from '../RoutePage';
import { buildDayPlan, buildStop, buildStops, STOP_IDS } from '../../__fixtures__/day-plan';

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => mockGet(...args) } }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Jane Doe', timezone: 'Australia/Sydney' } }),
}));
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => true }));

const TODAY = '2026-11-05';
const { B } = STOP_IDS;

function ok(plan = buildDayPlan()) {
  return { data: { data: plan }, error: undefined, response: { status: 200 } };
}
function err(status: number, code: string) {
  return { data: undefined, error: { error: { code, message: code } }, response: { status } };
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-04T20:00:00.000Z')); // today = 2026-11-05 Sydney
  mockGet.mockReset();
});
afterEach(() => vi.useRealTimers());

/** Render at /today/route[/:date] with a route tree so `useParams` sees `:date`. */
function renderRoute(path = '/today/route') {
  return renderWithProviders(
    <Routes>
      <Route path="/today/route" element={<RoutePage />} />
      <Route path="/today/route/:date" element={<RoutePage />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

describe('RoutePage', () => {
  it('today header, summary and ordered stop list with legs', async () => {
    mockGet.mockResolvedValue(
      ok(buildDayPlan({ totals: { driveS: 2580, waitS: 1500, serviceS: 8100, lateS: 0, distanceM: 14200 } })),
    );
    renderRoute('/today/route');

    expect(await screen.findByRole('heading', { name: "Today's route" })).toBeInTheDocument();
    expect(await screen.findByTestId('route-subheader')).toHaveTextContent(
      'Thursday, 5 Nov · 3 stops · 45 min each',
    );
    expect(screen.getByText('43 min driving · Finish 10:35 am')).toBeInTheDocument();
    expect(screen.getByText('25 min waiting')).toBeInTheDocument();
    expect(screen.getByText('14.2 km')).toBeInTheDocument();

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // The first leg is labelled "From start".
    expect(screen.getByText(/From start:/)).toBeInTheDocument();
  });

  it('non-today header shows the short date', async () => {
    mockGet.mockResolvedValue(ok(buildDayPlan({ date: '2026-11-06' })));
    renderRoute('/today/route/2026-11-06');
    expect(await screen.findByRole('heading', { name: 'Route · Fri 6 Nov' })).toBeInTheDocument();
  });

  it('shows "· 45 min each" when every stop shares a duration', async () => {
    mockGet.mockResolvedValue(ok(buildDayPlan()));
    renderRoute();
    expect(await screen.findByText(/· 45 min each/)).toBeInTheDocument();
  });

  it('renders "Same address" for a zero-length leg (L-F04-13)', async () => {
    const stops = buildStops();
    stops[2] = buildStop({ ...stops[2]!, travelS: 0, distanceM: 0, lat: stops[1]!.lat, lng: stops[1]!.lng });
    mockGet.mockResolvedValue(ok(buildDayPlan({ stops })));
    renderRoute();
    expect(await screen.findByText('Same address')).toBeInTheDocument();
  });

  it('shows a window-violation note on the offending stop', async () => {
    const stops = buildStops();
    stops[1] = buildStop({ ...stops[1]!, lateS: 900, windowStart: '08:00', windowEnd: '09:00' });
    const plan = buildDayPlan({ stops, violations: [{ appointmentId: B, lateS: 900 }] });
    mockGet.mockResolvedValue(ok(plan));
    renderRoute();
    expect(await screen.findByText('Arrives after its window (8:00 am – 9:00 am)')).toBeInTheDocument();
  });

  it('origin BASE: a pencil edit control named for the day', async () => {
    mockGet.mockResolvedValue(ok(buildDayPlan()));
    renderRoute();
    expect(
      await screen.findByRole('button', { name: /Starting from Redfern NSW 2016\. Change starting point for this day/ }),
    ).toBeInTheDocument();
  });

  it('origin OVERRIDE: "(this day only)" + Use my base address', async () => {
    const plan = buildDayPlan({
      origin: { source: 'OVERRIDE', label: 'Sydney NSW 2000', lat: -33.87, lng: 151.2 },
      originOverride: {
        address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
        setAt: '2026-11-04T09:00:00.000Z',
      },
    });
    mockGet.mockResolvedValue(ok(plan));
    renderRoute();
    expect(await screen.findByText('Starting from: Sydney NSW 2000 (this day only)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my base address' })).toBeInTheDocument();
  });

  it('origin LAST_STOP: text only, no edit, no change-for-day control (L-F04-07)', async () => {
    const plan = buildDayPlan({
      origin: { source: 'LAST_STOP', label: 'Surry Hills', lat: -33.88, lng: 151.21 },
    });
    mockGet.mockResolvedValue(ok(plan));
    renderRoute();
    expect(await screen.findByText('Continuing from: Surry Hills')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change starting point for this day/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use my base address' })).toBeNull();
  });

  it('origin NONE: no-base warning + set-a-starting-point', async () => {
    const plan = buildDayPlan({
      origin: { source: 'NONE', label: null, lat: null, lng: null },
      originWarning: 'NO_BASE',
    });
    mockGet.mockResolvedValue(ok(plan));
    renderRoute();
    expect(await screen.findByText('No base address: route has no starting point')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set a starting point for this day' })).toBeInTheDocument();
  });

  it('offers PDF and XLSX in the download menu', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockGet.mockResolvedValue(ok(buildDayPlan()));
    renderRoute();
    await user.click(await screen.findByTestId('route-sheet-download'));
    const menu = screen.getByRole('menu', { name: 'Download route sheet' });
    expect(within(menu).getByRole('menuitem', { name: 'PDF' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Spreadsheet (XLSX)' })).toBeInTheDocument();
  });

  it('past date is read-only: origin shown as text, no pencil', async () => {
    mockGet.mockResolvedValue(ok(buildDayPlan({ date: '2026-11-01' })));
    renderRoute('/today/route/2026-11-01');
    expect(await screen.findByText('Starting from: Redfern NSW 2016')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change starting point for this day/ })).toBeNull();
  });

  it('NOT_PUBLISHED shows the ready-at message', async () => {
    mockGet.mockResolvedValue(err(404, 'DAY_PLAN_NOT_PUBLISHED'));
    renderRoute('/today/route/2026-11-06');
    expect(
      await screen.findByText("Your route for this day isn't ready yet. It's published at 7:30 pm the day before."),
    ).toBeInTheDocument();
  });

  it('NOT_FOUND shows the no-route message with Back to Today', async () => {
    mockGet.mockResolvedValue(err(404, 'DAY_PLAN_NOT_FOUND'));
    renderRoute('/today/route/2026-11-01');
    expect(await screen.findByText('There is no route for this day.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Today' })).toBeInTheDocument();
  });

  it('an invalid date in the path redirects to /today/route', async () => {
    mockGet.mockResolvedValue(ok(buildDayPlan()));
    renderRoute('/today/route/2026-13-40');
    // The redirect renders today's route (valid), so the GET for today runs.
    expect(await screen.findByRole('heading', { name: "Today's route" })).toBeInTheDocument();
  });
});
