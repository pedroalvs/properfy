import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeInspector, makeAlert, makeLiveDayResponse, envelope } from '../test-support/fixtures';

// ── Map doubles — the real map components have their own tests; here we only
// need to observe pins, routes and camera moves. ──────────────────────────────
const mapSpies = vi.hoisted(() => ({ fitBounds: vi.fn(), flyTo: vi.fn() }));

vi.mock('@/components/map', async () => {
  const React = await import('react');
  const fakeMap = { fitBounds: mapSpies.fitBounds, flyTo: mapSpies.flyTo };
  return {
    MapContainer: ({ children, onMapReady }: { children?: unknown; onMapReady?: (m: unknown) => void }) => {
      React.useEffect(() => {
        onMapReady?.(fakeMap);
      }, [onMapReady]);
      return React.createElement('div', { 'data-testid': 'map' }, children as never);
    },
    MapScreenLayout: ({ sidePanel, map }: { sidePanel?: unknown; map?: unknown }) =>
      React.createElement('div', null, map as never, sidePanel as never),
    // No visible label text in the double — keep the accessible name only, so the
    // inspector name is unambiguous between the list row and its pin in queries.
    MapMarker: ({ ariaLabel, label, onClick, headColor }: { ariaLabel?: string; label?: string; onClick?: () => void; headColor?: string }) =>
      React.createElement('button', { 'data-testid': 'map-marker', 'aria-label': ariaLabel ?? label, 'data-headcolor': headColor, onClick }),
    RouteLayer: ({ id, emphasis, onClick }: { id: string; emphasis?: string; onClick?: () => void }) =>
      React.createElement('button', { 'data-testid': 'route-layer', 'data-id': id, 'data-emphasis': emphasis, onClick }),
    computeMarkerOffsets: () => new Map(),
  };
});

const getMock = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => getMock(...args) } }));

import { LiveDayPage } from './LiveDayPage';

const etaEnvelope = {
  data: {
    data: { days: 30, sampleSize: 214, excludedOutliers: 0, meanAbsoluteErrorMinutes: 6.2, thresholdMinutes: 10, minSampleSize: 30, status: 'OK' },
  },
  error: undefined,
};

let liveDayResult: unknown = envelope(makeLiveDayResponse());

function setLiveDay(result: unknown) {
  liveDayResult = result;
}

let currentSearch = '';
function LocationProbe() {
  currentSearch = useLocation().search;
  return null;
}

function renderPage(path = '/live-day') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={client}>
        <LiveDayPage />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  mapSpies.fitBounds.mockReset();
  mapSpies.flyTo.mockReset();
  liveDayResult = envelope(makeLiveDayResponse());
  getMock.mockImplementation((path: string) =>
    path.includes('eta-accuracy') ? Promise.resolve(etaEnvelope) : Promise.resolve(liveDayResult),
  );
});

afterEach(() => {
  vi.useRealTimers();
  currentSearch = '';
});

describe('LiveDayPage', () => {
  it('shows a skeleton while the first request is in flight', () => {
    getMock.mockImplementation((path: string) =>
      path.includes('eta-accuracy') ? Promise.resolve(etaEnvelope) : new Promise(() => {}),
    );
    renderPage();
    expect(screen.getByTestId('live-day-skeleton')).toBeInTheDocument();
  });

  it('renders the roster with the title, subtitle, a row and one pin', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: /Live Day/ })).toBeInTheDocument();
    expect(screen.getByText('Last known location · updates every 30 s')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Inspectors' });
    expect(within(list).getByText('Jane Doe')).toBeInTheDocument();
    const pins = screen.getAllByTestId('map-marker');
    expect(pins).toHaveLength(1);
    expect(pins[0]).toHaveAttribute('aria-label', expect.stringContaining('Jane Doe — At a property, 1 of 3 done, 22 min late'));
  });

  it('01.A4: flips the state on the next poll after a check-out', async () => {
    vi.useFakeTimers();
    const inList = () => within(screen.getByRole('list', { name: 'Inspectors' }));
    setLiveDay(envelope(makeLiveDayResponse({ inspectors: [makeInspector({ state: 'AT_PROPERTY' })] })));
    renderPage();
    await vi.waitFor(() => expect(inList().getByText('At a property')).toBeInTheDocument());

    setLiveDay(envelope(makeLiveDayResponse({ inspectors: [makeInspector({ state: 'IN_TRANSIT' })] })));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await vi.waitFor(() => expect(inList().getByText('In transit')).toBeInTheDocument());
  });

  it('shows the empty state when nobody has work', async () => {
    setLiveDay(envelope(makeLiveDayResponse({ inspectors: [], summary: { inspectors: 0, notStarted: 0, atProperty: 0, inTransit: 0, doneForDay: 0, needsAttention: 0, stopsDone: 0, stopsTotal: 0 } })));
    renderPage();
    expect(await screen.findByText(/No inspectors have work on/)).toBeInTheDocument();
  });

  it('shows an error state with Try again on a first-load failure', async () => {
    getMock.mockImplementation((path: string) =>
      path.includes('eta-accuracy') ? Promise.resolve(etaEnvelope) : Promise.reject(new Error('boom')),
    );
    renderPage();
    expect(await screen.findByText("We couldn't load the Live Day.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps the list and shows a polite banner when a poll fails (01.A5 list stays)', async () => {
    vi.useFakeTimers();
    renderPage();
    await vi.waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    getMock.mockImplementation((path: string) =>
      path.includes('eta-accuracy') ? Promise.resolve(etaEnvelope) : Promise.reject(new Error('down')),
    );
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await vi.waitFor(() => expect(screen.getByText(/Couldn't refresh\. Showing data from/)).toBeInTheDocument());
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('01.A5: the Needs attention filter hides inspectors without alerts', async () => {
    setLiveDay(
      envelope(
        makeLiveDayResponse({
          inspectors: [
            makeInspector({ inspectorId: 'a', inspectorName: 'Alerted', alerts: [makeAlert({ type: 'CANT_DO', appointmentId: 'x', appointmentCode: 'INS-9' })], needsAttention: true }),
            makeInspector({ inspectorId: 'b', inspectorName: 'Calm', alerts: [], needsAttention: false }),
          ],
        }),
      ),
    );
    renderPage();
    await screen.findByText('Alerted');
    expect(screen.getByText('Calm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    await waitFor(() => expect(screen.queryByText('Calm')).toBeNull());
    expect(screen.getByText('Alerted')).toBeInTheDocument();
  });

  it('selects an inspector, draws its route and returns to the list', async () => {
    setLiveDay(
      envelope(
        makeLiveDayResponse({ inspectors: [makeInspector({ inspectorId: 'insp-1', inspectorName: 'Jane Doe', geometryIncluded: true, geometry: { type: 'FeatureCollection', features: [] } })] }),
      ),
    );
    renderPage();
    const row = within(await screen.findByRole('list', { name: 'Inspectors' })).getByText('Jane Doe');
    fireEvent.click(row);
    expect(await screen.findByRole('heading', { level: 2, name: /Jane Doe/ })).toBeInTheDocument();
    await waitFor(() => {
      const route = screen.getByTestId('route-layer');
      expect(route).toHaveAttribute('data-emphasis', 'selected');
    });
    fireEvent.click(screen.getByRole('button', { name: /back to all inspectors/i }));
    expect(await screen.findByRole('list', { name: 'Inspectors' })).toBeInTheDocument();
  });

  it('stops polling on a past day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T02:00:00Z'));
    setLiveDay(envelope(makeLiveDayResponse({ date: '2026-11-04', today: '2026-11-05' })));
    renderPage('/live-day?date=2026-11-04');
    await vi.waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    getMock.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    const liveDayCalls = getMock.mock.calls.filter((c) => String(c[0]).includes('dashboard/live-day'));
    expect(liveDayCalls).toHaveLength(0);
  });

  it('disables Show all routes above the cap', async () => {
    const many = Array.from({ length: 41 }, (_, i) => makeInspector({ inspectorId: `i${i}`, inspectorName: `Inspector ${i}` }));
    setLiveDay(envelope(makeLiveDayResponse({ inspectors: many })));
    renderPage();
    await screen.findByText('Inspector 0');
    const toggle = screen.getByRole('button', { name: /Show all routes/ });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAttribute('title', 'Narrow the list (Needs attention) to show all routes — up to 40 at once');
  });

  it('re-anchors a too-far deep link to today with a notice (L-F05-05)', async () => {
    getMock.mockImplementation((path: string, opts: { params?: { query?: { date?: string } } }) => {
      if (path.includes('eta-accuracy')) return Promise.resolve(etaEnvelope);
      const date = opts?.params?.query?.date;
      if (date === '2026-11-20') {
        return Promise.reject({ error: { code: 'LIVE_DAY_DATE_TOO_FAR', message: 'too far' } });
      }
      return Promise.resolve(envelope(makeLiveDayResponse({ date: '2026-11-05', today: '2026-11-05' })));
    });
    renderPage('/live-day?date=2026-11-20');
    expect(await screen.findByText("That day isn't available yet. Showing today.")).toBeInTheDocument();
    await waitFor(() => expect(currentSearch).toContain('date=2026-11-05'));
    expect(screen.queryByText("We couldn't load the Live Day.")).toBeNull();
  });

  it('renders the ETA accuracy footer', async () => {
    renderPage();
    expect(await screen.findByTestId('route-eta-accuracy')).toHaveTextContent('Route ETA accuracy (30 days): 6.2 min average error · 214 stops');
  });

  it('shows the Route infeasible indicator without counting it in Needs attention', async () => {
    setLiveDay(
      envelope(
        makeLiveDayResponse({
          inspectors: [
            makeInspector({ inspectorId: 'a', inspectorName: 'Jane Doe', needsAttention: false, alerts: [], routeFeasible: false, routeViolations: [{ appointmentId: 'x', appointmentCode: 'RWS-0042', sequence: 3, lateMinutes: 25 }] }),
          ],
          summary: { inspectors: 1, notStarted: 0, atProperty: 1, inTransit: 0, doneForDay: 0, needsAttention: 0, stopsDone: 1, stopsTotal: 3 },
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Route infeasible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs attention \(0\)/ })).toBeInTheDocument();
  });

  it('camera fits on first load but not on an identical poll', async () => {
    vi.useFakeTimers();
    setLiveDay(
      envelope(
        makeLiveDayResponse({
          inspectors: [
            makeInspector({ inspectorId: 'a', inspectorName: 'Jane Doe' }),
            makeInspector({ inspectorId: 'b', inspectorName: 'Tom Lee', lastKnown: { source: 'CHECK_IN', lat: -33.9, lng: 151.3, at: '2026-11-05T10:00:00+11:00', appointmentId: null, label: null } }),
          ],
        }),
      ),
    );
    renderPage();
    await vi.waitFor(() => expect(within(screen.getByRole('list', { name: 'Inspectors' })).getByText('Jane Doe')).toBeInTheDocument());
    await vi.waitFor(() => expect(mapSpies.fitBounds).toHaveBeenCalledTimes(1));
    mapSpies.fitBounds.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(mapSpies.fitBounds).not.toHaveBeenCalled();
  });
});
