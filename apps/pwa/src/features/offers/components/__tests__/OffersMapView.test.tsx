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
}));

vi.mock('mapbox-gl', () => {
  class FakeMap {
    constructor(_opts: unknown) {}
    on(event: string, cb: () => void) {
      if (event === 'load') cb();
    }
    addControl() {}
    remove() {}
    fitBounds = spies.fitBounds;
    flyTo = spies.flyTo;
  }
  class FakeMarker {
    private el: HTMLElement;
    constructor(opts: { element: HTMLElement }) {
      this.el = opts.element;
    }
    setLngLat(coords: [number, number]) {
      spies.markerCoords.push(coords);
      return this;
    }
    addTo() {
      document.body.appendChild(this.el);
      spies.markerElements.push(this.el);
      return this;
    }
    remove() {
      this.el.remove();
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

beforeEach(() => {
  spies.fitBounds.mockClear();
  spies.flyTo.mockClear();
  spies.markerElements.length = 0;
  spies.markerCoords.length = 0;
  document.body.replaceChildren();
});

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
    expect(chip).toHaveTextContent('08:00–09:00');
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
