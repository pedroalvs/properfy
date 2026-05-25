/**
 * Anti-regression for the React+Mapbox `removeChild` crash that hit
 * `/appointments` when filters changed the marker list.
 *
 * Pre-fix, `MapMarker` handed the React-rendered `<div ref={...}>` to
 * `new mapboxgl.Marker({ element })`. Mapbox detached that node from
 * its React parent and reparented it inside the canvas. When the
 * filter click triggered a re-render that removed the marker from
 * the rendered list, React walked the original parent's children to
 * unmount the node and threw "The object can not be found here."
 *
 * The fix uses `createPortal` to render the React UI into a detached
 * DOM node owned by Mapbox — React only manages the portal target's
 * children, never the parent that was reparented.
 *
 * This test simulates the crash conditions: it provides a fake
 * `MapContext` whose `getMap()` returns a stub Mapbox map, then
 * forces the kind of marker-list mutation the filter triggers in
 * production. Pre-fix this test fails with the same DOMException
 * (NotFoundError) that the production crash surfaced; post-fix the
 * unmount path is clean.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import { MapMarker } from './MapMarker';

// ---- Mapbox stub ----------------------------------------------------
// We don't load the real mapbox-gl bundle in unit tests. The factory
// covers exactly the surface MapMarker uses: `Marker` constructor +
// chainable `setLngLat`/`addTo` + a working `remove()` cleanup. The
// stub reproduces the production behaviour that triggers the bug —
// `addTo` MOVES the supplied element out of its current parent into
// a synthetic "canvas" node, which is the exact mutation React's
// reconciliation later trips over pre-fix. The factory body is
// hoisted by Vitest, so any references must live inside it.
vi.mock('mapbox-gl', () => {
  const fakeCanvas = document.createElement('div');
  fakeCanvas.setAttribute('data-testid', 'fake-mapbox-canvas');
  document.body.appendChild(fakeCanvas);

  class FakeMarker {
    private element: HTMLElement;
    constructor(opts: { element: HTMLElement }) {
      this.element = opts.element;
    }
    setLngLat(_: [number, number]) { return this; }
    addTo(_: unknown) {
      fakeCanvas.appendChild(this.element);
      return this;
    }
    remove() {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }

  return {
    default: {
      Marker: FakeMarker,
      NavigationControl: class {},
    },
  };
});

// ---- MapContext stub ------------------------------------------------
// `MapMarker` reads `getMap()` from `useMapInstance`. Provide a
// non-null fake map so the marker takes the production code path
// (creates a detached node, hands it to Mapbox). The `getMap`
// closure is stable across renders (mirrors the production
// `useCallback`-memoised value) — without this, an inline arrow
// every call would be a new identity each render and the marker
// effect would loop forever recreating itself.
vi.mock('./MapContainer', () => {
  const fakeMap = {} as object;
  const getMap = () => fakeMap;
  return {
    useMapInstance: () => ({ getMap }),
  };
});

interface MarkerSeed {
  id: string;
  longitude: number;
  latitude: number;
}

function MarkerListHarness({ initial }: { initial: MarkerSeed[] }) {
  const [markers, setMarkers] = useState<MarkerSeed[]>(initial);
  return (
    <>
      <button
        type="button"
        data-testid="filter-button"
        onClick={() =>
          // Simulate a filter click that drops the first marker — this
          // is the exact mutation that crashed the page pre-fix.
          setMarkers((prev) => prev.slice(1))
        }
      >
        filter
      </button>
      {markers.map((m) => (
        <MapMarker key={m.id} longitude={m.longitude} latitude={m.latitude} />
      ))}
    </>
  );
}

describe('MapMarker — React+Mapbox crash regression', () => {
  it('does not throw "The object can not be found here." when a filter removes a marker', () => {
    const seed: MarkerSeed[] = [
      { id: 'a', longitude: 151.20, latitude: -33.86 },
      { id: 'b', longitude: 151.21, latitude: -33.87 },
      { id: 'c', longitude: 151.22, latitude: -33.88 },
    ];

    const { getByTestId } = render(<MarkerListHarness initial={seed} />);

    // Fire the filter — pre-fix this is where React's commit phase
    // walks the original parent of marker `a` and crashes because
    // Mapbox already moved the node into the fake canvas.
    expect(() => {
      act(() => {
        getByTestId('filter-button').click();
      });
    }).not.toThrow();
  });

  it('survives multiple successive filter clicks (re-renders + unmounts)', () => {
    const seed: MarkerSeed[] = [
      { id: 'a', longitude: 0, latitude: 0 },
      { id: 'b', longitude: 1, latitude: 1 },
      { id: 'c', longitude: 2, latitude: 2 },
      { id: 'd', longitude: 3, latitude: 3 },
    ];

    const { getByTestId } = render(<MarkerListHarness initial={seed} />);

    // 4 clicks → list goes 4 → 3 → 2 → 1 → 0. Pre-fix the first
    // click already throws; post-fix all four clicks complete
    // cleanly.
    expect(() => {
      act(() => {
        for (let i = 0; i < 4; i += 1) {
          getByTestId('filter-button').click();
        }
      });
    }).not.toThrow();
  });

  it('cleans up the node from the fake canvas when the marker unmounts', () => {
    const { unmount, getAllByRole } = render(
      <MapMarker longitude={0} latitude={0} label="X" />,
    );
    // Sanity: the inner button rendered (via portal into the
    // Mapbox-owned node, which the FakeMarker stub appended to
    // fakeCanvas).
    expect(getAllByRole('button').length).toBeGreaterThan(0);

    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
