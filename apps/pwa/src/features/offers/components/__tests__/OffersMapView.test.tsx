import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OffersMapView, type ExpandedGroup } from '../OffersMapView';
import type { MarketplaceOffer } from '../../types';

vi.mock('@/config/env', () => ({ env: { mapboxToken: 'test-token' } }));

const spies = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  markerElements: [] as HTMLElement[],
  markerCoords: [] as Array<[number, number]>,
  handlers: {} as Record<string, Array<(event?: unknown) => void>>,
  /** When true, 'load' is only registered — the test decides when it fires. */
  deferLoad: false,
  setOffset: vi.fn(),
  markers: [] as Array<{
    coords: [number, number] | null;
    offset: [number, number];
    alive: boolean;
  }>,
  // Current zoom of the fake map; tests move it to exercise re-projection.
  // Literal rather than BASE_ZOOM: vi.hoisted runs before the const exists.
  zoom: 11,
}));

const BASE_ZOOM = 11;
/** Deterministic stand-in for mapbox's projection: 1 unit of lng/lat = 1000px at BASE_ZOOM. */
const PROJECT_SCALE = 1000;

/** Mirrors mapbox: one zoom level doubles the pixels per degree. */
function projectScale() {
  return PROJECT_SCALE * 2 ** (spies.zoom - BASE_ZOOM);
}

vi.mock('mapbox-gl', () => {
  class FakeMap {
    // Take the zoom the component actually asked for, so the fake projection
    // is the one under test rather than one that merely happens to match.
    constructor(opts: { zoom?: number }) {
      if (typeof opts?.zoom === 'number') spies.zoom = opts.zoom;
    }
    on(event: string, cb: (event?: unknown) => void) {
      (spies.handlers[event] ??= []).push(cb);
      if (event === 'load' && !spies.deferLoad) cb();
    }
    addControl() {}
    remove() {}
    project([lng, lat]: [number, number]) {
      const scale = projectScale();
      return { x: lng * scale, y: -lat * scale };
    }
    fitBounds = spies.fitBounds;
    flyTo = spies.flyTo;
  }
  class FakeMarker {
    private el: HTMLElement;
    private record: (typeof spies.markers)[number];
    constructor(opts: { element: HTMLElement }) {
      this.el = opts.element;
      this.record = { coords: null, offset: [0, 0], alive: false };
      spies.markers.push(this.record);
    }
    setLngLat(coords: [number, number]) {
      spies.markerCoords.push(coords);
      this.record.coords = coords;
      return this;
    }
    setOffset(offset: [number, number]) {
      spies.setOffset(offset);
      this.record.offset = offset;
      return this;
    }
    addTo() {
      document.body.appendChild(this.el);
      spies.markerElements.push(this.el);
      this.record.alive = true;
      return this;
    }
    remove() {
      this.el.remove();
      this.record.alive = false;
    }
  }
  class FakeNavigationControl {}
  return {
    default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: FakeNavigationControl, accessToken: '' },
  };
});

function makeOffer(overrides: Partial<MarketplaceOffer> = {}): MarketplaceOffer {
  return {
    groupId: 'group-1',
    groupNumber: 2042,
    code: '2042',
    tenantName: 'Acme Realty',
    serviceTypeName: 'Routine Inspection',
    groupSize: 3,
    scheduledDate: '2026-08-01',
    timeWindow: '08:00-12:00',
    priorityMode: 'NONE',
    priorityExpiresAt: null,
    suburbs: ['Sydney'],
    payoutEstimate: 250,
    appointmentCount: 3,
    centroid: { lat: -33.87, lng: 151.21 },
    ...overrides,
  };
}

const EXPANDED: ExpandedGroup = {
  groupId: 'group-1',
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
      coordinates: { lat: -33.8908, lng: 151.2743 },
    },
    {
      id: '00000000-0000-0000-0000-00000000a003',
      street: '30 Hill Ave',
      suburb: 'Manly NSW',
      timeSlotStart: '12:00',
      timeSlotEnd: '13:00',
      coordinates: null,
    },
  ],
};

async function waitForPins(testId: string, count: number) {
  await waitFor(() => {
    expect(screen.getAllByTestId(testId)).toHaveLength(count);
  });
}

/** Simulate a map event; `originalEvent` marks it as a real user gesture. */
function emitMapEvent(event: string, payload?: unknown) {
  for (const handler of spies.handlers[event] ?? []) handler(payload);
}

beforeEach(() => {
  spies.fitBounds.mockClear();
  spies.flyTo.mockClear();
  spies.markerElements.length = 0;
  spies.markerCoords.length = 0;
  for (const key of Object.keys(spies.handlers)) delete spies.handlers[key];
  spies.deferLoad = false;
  spies.setOffset.mockClear();
  spies.markers.length = 0;
  spies.zoom = BASE_ZOOM;
  document.body.replaceChildren();
});

/** Markers currently on the map, with the screen position they end up drawn at. */
function drawnMarkers() {
  return spies.markers
    .filter((m) => m.alive && m.coords)
    .map((m) => ({
      x: m.coords![0] * projectScale() + m.offset[0],
      y: -m.coords![1] * projectScale() + m.offset[1],
      offset: m.offset,
    }));
}

/** The invariant the feature exists for: no drawn pin overlaps another. */
function expectNoOverlappingPins(diameter = 36) {
  const drawn = drawnMarkers();
  for (let i = 0; i < drawn.length; i += 1) {
    for (let j = i + 1; j < drawn.length; j += 1) {
      const gap = Math.hypot(drawn[i].x - drawn[j].x, drawn[i].y - drawn[j].y);
      expect(gap).toBeGreaterThanOrEqual(diameter - 1e-6);
    }
  }
}

describe('OffersMapView — offers mode', () => {
  it('renders one pin per offer with a centroid and skips null centroids', async () => {
    render(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
          makeOffer({ groupId: 'group-3', centroid: null }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);
  });

  it('invokes onSelectOffer with the groupId when a pin is clicked', async () => {
    const onSelectOffer = vi.fn();
    render(<OffersMapView offers={[makeOffer()]} onSelectOffer={onSelectOffer} />);
    await waitForPins('map-pin', 1);

    fireEvent.click(screen.getByTestId('map-pin'));
    expect(onSelectOffer).toHaveBeenCalledWith('group-1');
  });

  it('REGRESSION: mouseenter must not touch the marker inline transform (mapbox positions pins via translate)', async () => {
    render(<OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />);
    await waitForPins('map-pin', 1);

    const pin = screen.getByTestId('map-pin');
    fireEvent.mouseEnter(pin);
    expect(pin.style.transform).toBe('');
    fireEvent.mouseLeave(pin);
    expect(pin.style.transform).toBe('');
  });

  it('shows the no-pins overlay when no offer has a centroid', async () => {
    render(<OffersMapView offers={[makeOffer({ centroid: null })]} onSelectOffer={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('map-no-pins')).toHaveTextContent('No offers with location data');
    });
  });

  it('skips offers whose centroid is non-finite or out of range', async () => {
    render(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: Number.NaN, lng: 151.25 } }),
          makeOffer({ groupId: 'group-3', centroid: { lat: -33.9, lng: 999 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 1);
    // A marker at NaN is a silently broken pin — worse than an absent one.
    expect(spies.markerCoords).toEqual([[151.21, -33.87]]);
  });
});

describe('OffersMapView — overlapping pins', () => {
  const SAME = { lat: -33.8148, lng: 151.0017 };

  it('draws two groups at the same location side by side instead of stacked', async () => {
    render(
      <OffersMapView
        offers={[
          makeOffer({ groupId: 'group-1', centroid: SAME }),
          makeOffer({ groupId: 'group-2', centroid: { ...SAME } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    // Both keep their true coordinate; only the drawing is nudged apart.
    expect(spies.markerCoords).toEqual([
      [SAME.lng, SAME.lat],
      [SAME.lng, SAME.lat],
    ]);
    const drawn = drawnMarkers();
    expect(drawn[0].offset).not.toEqual(drawn[1].offset);
    expectNoOverlappingPins();
  });

  it('keeps every pin of a large pile separated', async () => {
    render(
      <OffersMapView
        offers={Array.from({ length: 5 }, (_, i) =>
          makeOffer({ groupId: `group-${i}`, centroid: { ...SAME } }),
        )}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 5);
    expectNoOverlappingPins();
  });

  // The deliberate limit of the feature: a pin that is merely crowded must stay
  // on its true location. Zooming in separates those, and moving them would
  // misreport where the job is at every zoom in between.
  it('leaves pins that merely overlap on their true position', async () => {
    // 20px apart under the test projection — the 36px pins overlap on screen.
    render(
      <OffersMapView
        offers={[
          makeOffer({ groupId: 'group-1', centroid: SAME }),
          makeOffer({ groupId: 'group-2', centroid: { lat: SAME.lat, lng: SAME.lng + 0.02 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);
    expect(drawnMarkers().map((m) => m.offset)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('leaves well-separated pins at a zero offset', async () => {
    render(
      <OffersMapView
        offers={[
          makeOffer({ groupId: 'group-1', centroid: SAME }),
          makeOffer({ groupId: 'group-2', centroid: { lat: SAME.lat, lng: SAME.lng + 1 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);
    expect(drawnMarkers().map((m) => m.offset)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  // Coincident pins can never be separated by the camera, so their offset must
  // survive a zoom rather than be recomputed against it.
  it('keeps coincident pins apart after the camera moves', async () => {
    render(
      <OffersMapView
        offers={[
          makeOffer({ groupId: 'group-1', centroid: SAME }),
          makeOffer({ groupId: 'group-2', centroid: { ...SAME } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);
    const before = drawnMarkers().map((m) => m.offset);

    spies.zoom = BASE_ZOOM + 5;
    emitMapEvent('moveend');

    expect(drawnMarkers().map((m) => m.offset)).toEqual(before);
    expectNoOverlappingPins();
  });

  it('separates drill-down inspection pins at the same address', async () => {
    const at = { lat: -33.8688, lng: 151.2093 };
    render(
      <OffersMapView
        offers={[makeOffer()]}
        onSelectOffer={vi.fn()}
        expandedGroup={{
          groupId: 'group-1',
          appointments: [
            { ...EXPANDED.appointments[0], coordinates: at },
            { ...EXPANDED.appointments[1], coordinates: { ...at } },
          ],
        }}
      />,
    );
    await waitForPins('map-appointment-pin', 2);

    const drawn = drawnMarkers();
    expect(drawn[0].offset).not.toEqual(drawn[1].offset);
    expectNoOverlappingPins();
  });
});

describe('OffersMapView — offers-mode camera', () => {
  // The offers view never called fitBounds: the guard compared
  // prevExpandedIdRef (null) against the non-expanded id (also null), so it
  // early-returned on every render. The camera stayed wherever map init put it.
  it('fits the camera to every offer pin on first render', async () => {
    render(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    await waitFor(() => {
      expect(spies.fitBounds).toHaveBeenCalledWith(
        [
          [151.21, -33.9],
          [151.25, -33.87],
        ],
        expect.objectContaining({ maxZoom: 15 }),
      );
    });
  });

  // Map mode has no scroll to drive pagination, so MarketplacePage drains the
  // remaining pages after mount. Offers therefore arrive in waves, and a
  // fit-once camera leaves every later page off-screen.
  it('refits when more offers arrive from the pagination drain', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />,
    );
    await waitForPins('map-pin', 1);
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    rerender(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    await waitFor(() => {
      expect(spies.fitBounds).toHaveBeenCalled();
    });
  });

  it('does not move the camera when a refetch returns the same pins', async () => {
    const offers = [makeOffer(), makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } })];
    const { rerender } = render(<OffersMapView offers={offers} onSelectOffer={vi.fn()} />);
    await waitForPins('map-pin', 2);
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    // A periodic refetch hands back an equal-but-new array.
    rerender(<OffersMapView offers={[...offers]} onSelectOffer={vi.fn()} />);
    await waitForPins('map-pin', 2);

    expect(spies.fitBounds).not.toHaveBeenCalled();
    expect(spies.flyTo).not.toHaveBeenCalled();
  });

  it('stops refitting once the inspector has panned the map', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />,
    );
    await waitForPins('map-pin', 1);

    // originalEvent present => a real gesture, not our own flyTo/fitBounds.
    emitMapEvent('dragstart', { originalEvent: {} });
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    rerender(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    expect(spies.fitBounds).not.toHaveBeenCalled();
    expect(spies.flyTo).not.toHaveBeenCalled();
  });

  // Panning says "I want to look here" — but if every pin the inspector framed
  // is gone (offers taken by someone else, a refetch returning a different
  // region), that intent no longer refers to anything on the map, and leaving
  // the camera put would show an empty view with pins just off screen.
  it('re-frames when a pan is followed by a completely different offer set', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />,
    );
    await waitForPins('map-pin', 1);

    emitMapEvent('dragstart', { originalEvent: {} });
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    rerender(
      <OffersMapView
        offers={[
          makeOffer({ groupId: 'group-9', centroid: { lat: -37.81, lng: 144.96 } }),
          makeOffer({ groupId: 'group-10', centroid: { lat: -37.86, lng: 144.99 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    await waitFor(() => {
      expect(spies.fitBounds).toHaveBeenCalled();
    });
  });

  // Panning a map that had nothing to frame cannot count as "I chose this
  // view": there was no view to choose. Offers arrive after mount via the
  // pagination drain, so this ordering is routine, and treating it as a real
  // pan left the very first pins off screen for good.
  it('still frames the first pins when the inspector panned an empty map', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer({ centroid: null })]} onSelectOffer={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('map-no-pins')).toBeInTheDocument();
    });

    emitMapEvent('dragstart', { originalEvent: {} });
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    rerender(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    await waitFor(() => {
      expect(spies.fitBounds).toHaveBeenCalled();
    });
  });

  it('still respects a pan when the new offer set overlaps the framed one', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />,
    );
    await waitForPins('map-pin', 1);

    emitMapEvent('dragstart', { originalEvent: {} });
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    // group-1 is still there, so the inspector is still looking at something real.
    rerender(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    expect(spies.fitBounds).not.toHaveBeenCalled();
    expect(spies.flyTo).not.toHaveBeenCalled();
  });

  // Identity is the group, not its coordinate. A group's centroid is the mean of
  // its appointments, so adding one shifts it — with coordinate-based identity a
  // single-offer map read that micro-shift as "everything I framed is gone" and
  // flew a panning inspector back on the next refetch.
  it('respects a pan when the same group merely shifts its centroid', async () => {
    const { rerender } = render(
      <OffersMapView
        offers={[makeOffer({ groupId: 'group-1', centroid: { lat: -33.87, lng: 151.21 } })]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 1);

    emitMapEvent('dragstart', { originalEvent: {} });
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    rerender(
      <OffersMapView
        offers={[makeOffer({ groupId: 'group-1', centroid: { lat: -33.8702, lng: 151.2103 } })]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 1);

    expect(spies.flyTo).not.toHaveBeenCalled();
    expect(spies.fitBounds).not.toHaveBeenCalled();
  });

  it('re-frames when the panned inspector leaves the drill-down', async () => {
    const { rerender } = render(
      <OffersMapView
        offers={[makeOffer()]}
        onSelectOffer={vi.fn()}
        expandedGroup={EXPANDED}
      />,
    );
    await waitForPins('map-appointment-pin', 2);

    emitMapEvent('dragstart', { originalEvent: {} });
    spies.fitBounds.mockClear();
    spies.flyTo.mockClear();

    rerender(<OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />);
    await waitForPins('map-pin', 1);

    // Leaving the drill-down is an explicit navigation — it must re-frame.
    await waitFor(() => {
      expect(spies.flyTo).toHaveBeenCalled();
    });
  });

  it('ignores programmatic camera moves when deciding the inspector took over', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />,
    );
    await waitForPins('map-pin', 1);

    // Our own fitBounds fires zoomstart with no originalEvent; treating that as
    // a user gesture would disable auto-fit on the very first frame.
    emitMapEvent('zoomstart', {});
    spies.fitBounds.mockClear();

    rerender(
      <OffersMapView
        offers={[
          makeOffer(),
          makeOffer({ groupId: 'group-2', centroid: { lat: -33.9, lng: 151.25 } }),
        ]}
        onSelectOffer={vi.fn()}
      />,
    );
    await waitForPins('map-pin', 2);

    await waitFor(() => {
      expect(spies.fitBounds).toHaveBeenCalled();
    });
  });

  // The map is created behind a dynamic import, so offers routinely resolve
  // before mapbox finishes loading. The render effect bails out while the map
  // is not ready, and the load callback closes over the *first* render's
  // offers — so without a re-render on ready, a single-page result set could
  // leave the map permanently empty while the list showed every card.
  it('renders offers that arrived while the map was still loading', async () => {
    spies.deferLoad = true;
    const { rerender } = render(<OffersMapView offers={[]} onSelectOffer={vi.fn()} />);
    await waitFor(() => {
      expect(spies.handlers.load?.length).toBeGreaterThan(0);
    });

    rerender(<OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />);
    emitMapEvent('load');

    await waitForPins('map-pin', 1);
  });

  it('flies to a single offer instead of fitting a degenerate bounds', async () => {
    render(<OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />);
    await waitForPins('map-pin', 1);

    await waitFor(() => {
      expect(spies.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [151.21, -33.87], zoom: 12 }),
      );
    });
  });
});

describe('OffersMapView — map failure', () => {
  it('clears the error and rebuilds the map when Retry is pressed', async () => {
    render(<OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} />);
    await waitForPins('map-pin', 1);

    emitMapEvent('error');
    await waitFor(() => {
      expect(screen.getByTestId('map-error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    // The container has to survive the error state: the init effect bails out
    // on a missing container before it ever clears the error, so unmounting it
    // made Retry a dead button — the map could never come back.
    await waitFor(() => {
      expect(screen.queryByTestId('map-error')).not.toBeInTheDocument();
    });
    await waitForPins('map-pin', 1);
  });
});

describe('OffersMapView — expanded group (drill-down)', () => {
  it('shows only appointment pins for coordinated appointments and fits bounds (maxZoom 15)', async () => {
    render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);

    expect(screen.queryAllByTestId('map-pin')).toHaveLength(0);
    // Markers are placed at each appointment's [lng, lat] (mapbox order).
    expect(spies.markerCoords).toEqual([
      [151.2093, -33.8688],
      [151.2743, -33.8908],
    ]);
    await waitFor(() => {
      expect(spies.fitBounds).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ maxZoom: 15 }),
      );
    });
  });

  it('skips appointments with non-finite or out-of-range coordinates', async () => {
    render(
      <OffersMapView
        offers={[makeOffer()]}
        onSelectOffer={vi.fn()}
        expandedGroup={{
          groupId: 'group-1',
          appointments: [
            EXPANDED.appointments[0],
            { ...EXPANDED.appointments[1], coordinates: { lat: Number.NaN, lng: 151.27 } },
            { ...EXPANDED.appointments[2], coordinates: { lat: 999, lng: 151.24 } },
          ],
        }}
      />,
    );
    await waitForPins('map-appointment-pin', 1);
    expect(spies.markerCoords).toEqual([[151.2093, -33.8688]]);
  });

  it('flies to zoom 15 when the group has a single located appointment', async () => {
    render(
      <OffersMapView
        offers={[makeOffer()]}
        onSelectOffer={vi.fn()}
        expandedGroup={{ groupId: 'group-1', appointments: [EXPANDED.appointments[0]] }}
      />,
    );
    await waitForPins('map-appointment-pin', 1);
    await waitFor(() => {
      expect(spies.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 15 }));
    });
  });

  it('labels appointment pins with their 1-based position, never an id or code', async () => {
    render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);

    const pins = screen.getAllByTestId('map-appointment-pin');
    expect(pins.map((pin) => pin.textContent)).toEqual(['1', '2']);
    for (const pin of pins) {
      expect(pin.textContent).not.toMatch(/[0-9a-f]{8}-/i);
    }
  });

  it('shows the info chip with street, suburb and time window on pin tap — without any appointment id/code', async () => {
    render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);

    fireEvent.click(screen.getAllByTestId('map-appointment-pin')[0]);
    const chip = screen.getByTestId('map-appointment-chip');
    expect(chip).toHaveTextContent('10 Main St');
    expect(chip).toHaveTextContent('Sydney NSW');
    expect(chip).toHaveTextContent('8:00 am – 9:00 am');
    expect(chip.textContent).not.toMatch(/[0-9a-f]{8}-/i);
    expect(chip.textContent).not.toContain('a001');
  });

  it('swaps the chip when another pin is tapped and closes via the close button', async () => {
    render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);
    const pins = screen.getAllByTestId('map-appointment-pin');

    fireEvent.click(pins[0]);
    expect(screen.getByTestId('map-appointment-chip')).toHaveTextContent('10 Main St');

    fireEvent.click(pins[1]);
    expect(screen.getByTestId('map-appointment-chip')).toHaveTextContent('20 Beach Rd');

    fireEvent.click(screen.getByTestId('map-appointment-chip-close'));
    expect(screen.queryByTestId('map-appointment-chip')).toBeNull();
  });

  it('toggles the chip closed when the same pin is tapped twice', async () => {
    render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);
    const pin = screen.getAllByTestId('map-appointment-pin')[0];

    fireEvent.click(pin);
    expect(screen.getByTestId('map-appointment-chip')).toBeInTheDocument();
    fireEvent.click(pin);
    expect(screen.queryByTestId('map-appointment-chip')).toBeNull();
  });

  it('shows a "No location data for this group" overlay when every appointment lacks coordinates', async () => {
    render(
      <OffersMapView
        offers={[makeOffer()]}
        onSelectOffer={vi.fn()}
        expandedGroup={{
          groupId: 'group-1',
          appointments: EXPANDED.appointments.map((a) => ({ ...a, coordinates: null })),
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('map-no-pins')).toHaveTextContent('No location data for this group');
    });
    expect(screen.queryAllByTestId('map-appointment-pin')).toHaveLength(0);
  });

  it('keeps the appointment pins when the offers list refetches while expanded', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);

    rerender(
      <OffersMapView
        offers={[makeOffer(), makeOffer({ groupId: 'group-9' })]}
        onSelectOffer={vi.fn()}
        expandedGroup={EXPANDED}
      />,
    );
    await waitForPins('map-appointment-pin', 2);
    expect(screen.queryAllByTestId('map-pin')).toHaveLength(0);
  });

  it('restores the offer pins and hides the chip when the expansion is cleared', async () => {
    const { rerender } = render(
      <OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={EXPANDED} />,
    );
    await waitForPins('map-appointment-pin', 2);
    fireEvent.click(screen.getAllByTestId('map-appointment-pin')[0]);
    expect(screen.getByTestId('map-appointment-chip')).toBeInTheDocument();

    rerender(<OffersMapView offers={[makeOffer()]} onSelectOffer={vi.fn()} expandedGroup={null} />);
    await waitForPins('map-pin', 1);
    expect(screen.queryAllByTestId('map-appointment-pin')).toHaveLength(0);
    expect(screen.queryByTestId('map-appointment-chip')).toBeNull();
  });
});
