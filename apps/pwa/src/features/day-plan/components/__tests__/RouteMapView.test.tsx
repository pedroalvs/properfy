import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { buildDayPlan, buildStops, STOP_IDS } from '../../__fixtures__/day-plan';
import RouteMapView from '../RouteMapView';

let tokenValue = 'test-token';
vi.mock('@/config/env', () => ({ env: { get mapboxToken() { return tokenValue; } } }));

const spies = vi.hoisted(() => ({
  handlers: {} as Record<string, Array<(event?: unknown) => void>>,
  setData: vi.fn(),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  deferLoad: false,
}));

vi.mock('mapbox-gl', () => {
  class FakeMap {
    private hasSource = false;
    on(event: string, cb: (event?: unknown) => void) {
      (spies.handlers[event] ??= []).push(cb);
      if (event === 'load' && !spies.deferLoad) cb();
    }
    addControl() {}
    remove() {}
    addSource() {
      this.hasSource = true;
    }
    addLayer() {}
    getSource() {
      return this.hasSource ? { setData: spies.setData } : undefined;
    }
    fitBounds = spies.fitBounds;
    flyTo = spies.flyTo;
  }
  class FakeMarker {
    private el: HTMLElement;
    constructor(opts: { element: HTMLElement }) {
      this.el = opts.element;
    }
    setLngLat() {
      return this;
    }
    setOffset() {
      return this;
    }
    addTo() {
      document.body.appendChild(this.el);
      return this;
    }
    remove() {
      this.el.remove();
    }
  }
  return { default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {}, accessToken: '' } };
});

function emit(event: string, payload?: unknown) {
  for (const h of spies.handlers[event] ?? []) h(payload);
}

const { A } = STOP_IDS;

beforeEach(() => {
  tokenValue = 'test-token';
  spies.handlers = {};
  spies.setData.mockClear();
  spies.fitBounds.mockClear();
  spies.flyTo.mockClear();
  spies.deferLoad = false;
  document.body.querySelectorAll('[data-testid="route-map-pin"],[data-testid="route-map-origin-pin"]').forEach((n) => n.remove());
});

const order = buildStops().map((s) => s.appointmentId);

describe('RouteMapView', () => {
  it('renders a numbered pin per plottable stop in order, with ETA aria-labels', async () => {
    renderWithProviders(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getAllByTestId('route-map-pin')).toHaveLength(3));
    const pins = screen.getAllByTestId('route-map-pin');
    expect(pins.map((p) => p.textContent)).toEqual(['1', '2', '3']);
    expect(pins[0]!.getAttribute('aria-label')).toMatch(/^Stop 1, 12 King St, Surry Hills NSW 2010, ETA /);
  });

  it('renders the origin marker for a BASE origin', async () => {
    renderWithProviders(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getByTestId('route-map-origin-pin')).toBeTruthy());
    expect(screen.getByTestId('route-map-origin-pin').getAttribute('aria-label')).toBe('Start: Redfern NSW 2016');
  });

  it('omits the origin marker when the plan has no origin', async () => {
    const plan = buildDayPlan({ origin: { source: 'NONE', label: null, lat: null, lng: null } });
    renderWithProviders(<RouteMapView plan={plan} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getAllByTestId('route-map-pin')).toHaveLength(3));
    expect(screen.queryByTestId('route-map-origin-pin')).toBeNull();
  });

  it('counts stops without coordinates in the off-map note and plots the rest', async () => {
    const stops = buildStops();
    stops[1] = { ...stops[1]!, missingCoordinates: true, lat: null, lng: null };
    const plan = buildDayPlan({ stops });
    renderWithProviders(<RouteMapView plan={plan} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getAllByTestId('route-map-pin')).toHaveLength(2));
    expect(screen.getByTestId('route-map-offmap-note').textContent).toContain("1 stop aren't on the map");
  });

  it('pushes the geometry to the line source, and clears it (empty FC) while dirty', async () => {
    const { rerender } = renderWithProviders(
      <RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty={false} />,
    );
    await waitFor(() => expect(spies.setData).toHaveBeenCalled());
    const lastClean = spies.setData.mock.calls.at(-1)![0];
    expect(lastClean).toEqual(buildDayPlan().geometry);

    rerender(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty />);
    await waitFor(() => {
      expect(spies.setData.mock.calls.at(-1)![0]).toEqual({ type: 'FeatureCollection', features: [] });
    });
    expect(screen.getByTestId('route-map-dirty-chip')).toBeTruthy();
  });

  it('opens a chip with an Open details link when a pin is tapped', async () => {
    renderWithProviders(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getAllByTestId('route-map-pin')).toHaveLength(3));
    fireEvent.click(screen.getAllByTestId('route-map-pin')[0]!);
    const chip = screen.getByTestId('route-map-chip');
    expect(chip.textContent).toContain('Stop 1');
    const link = chip.querySelector('a')!;
    expect(link.getAttribute('href')).toBe(`/schedule/${A}`);
  });

  it('drops the stale saved ETA from pins and chip while a reorder draft is dirty', async () => {
    renderWithProviders(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty />);
    await waitFor(() => expect(screen.getAllByTestId('route-map-pin')).toHaveLength(3));
    const pin1 = screen.getAllByTestId('route-map-pin')[0]!;
    expect(pin1.getAttribute('aria-label')).toBe('Stop 1, 12 King St, Surry Hills NSW 2010');
    fireEvent.click(pin1);
    expect(screen.getByTestId('route-map-chip').textContent).toContain('Stop 1');
    expect(screen.getByTestId('route-map-chip').textContent).not.toContain('ETA');
  });

  it('shows the unavailable message when there is no Mapbox token', async () => {
    tokenValue = '';
    renderWithProviders(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getByText('Map is temporarily unavailable.')).toBeTruthy());
  });

  it('shows a load error with Retry when the map errors', async () => {
    spies.deferLoad = true;
    renderWithProviders(<RouteMapView plan={buildDayPlan()} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(spies.handlers.error?.length).toBeGreaterThan(0));
    emit('error');
    await waitFor(() => expect(screen.getByText('Map failed to load. Check your connection.')).toBeTruthy());
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('shows the no-plottable-pins notice when nothing can be placed', async () => {
    const stops = buildStops().map((s) => ({ ...s, missingCoordinates: true, lat: null, lng: null }));
    const plan = buildDayPlan({ stops, origin: { source: 'NONE', label: null, lat: null, lng: null } });
    renderWithProviders(<RouteMapView plan={plan} displayOrder={order} isDirty={false} />);
    await waitFor(() => expect(screen.getByText("None of today's stops have a location on the map.")).toBeTruthy());
  });
});
