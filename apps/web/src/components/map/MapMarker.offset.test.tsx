/**
 * The pixel offset is how the appointments map keeps two markers at the same
 * address from being drawn on top of each other. It has to reach the Mapbox
 * marker via `setOffset` — Mapbox folds that into its own positioning
 * transform, whereas writing to the element's `style.transform` would fight
 * the transform Mapbox already puts there and snap the pin to the map origin.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MapMarker } from './MapMarker';

const spies = vi.hoisted(() => ({ setOffset: vi.fn(), constructed: vi.fn() }));

vi.mock('mapbox-gl', () => {
  class FakeMarker {
    private element: HTMLElement;
    constructor(opts: { element: HTMLElement }) {
      spies.constructed();
      this.element = opts.element;
    }
    setLngLat(_: [number, number]) {
      return this;
    }
    setOffset(offset: [number, number]) {
      spies.setOffset(offset);
      return this;
    }
    addTo(_: unknown) {
      document.body.appendChild(this.element);
      return this;
    }
    remove() {
      this.element.remove();
    }
  }
  return { default: { Marker: FakeMarker }, Marker: FakeMarker };
});

// `getMap` MUST be a stable closure, mirroring the production
// `useCallback`-memoised value. An inline arrow per call is a new identity
// every render, and MapMarker's create effect depends on it — the marker would
// recreate itself forever and the test would hang rather than fail.
vi.mock('./MapContainer', () => {
  const fakeMap = {} as object;
  const getMap = () => fakeMap;
  return { useMapInstance: () => ({ getMap }) };
});

describe('MapMarker offset', () => {
  it('passes the offset through to the mapbox marker', () => {
    render(<MapMarker longitude={151.21} latitude={-33.87} offset={[18, 0]} />);
    expect(spies.setOffset).toHaveBeenCalledWith([18, 0]);
  });

  it('defaults to no offset so an uncollided marker sits on its coordinate', () => {
    spies.setOffset.mockClear();
    render(<MapMarker longitude={151.21} latitude={-33.87} />);
    expect(spies.setOffset).toHaveBeenCalledWith([0, 0]);
  });

  it('re-applies when the offset changes, without recreating the marker', () => {
    spies.setOffset.mockClear();
    spies.constructed.mockClear();
    const { rerender } = render(
      <MapMarker longitude={151.21} latitude={-33.87} offset={[18, 0]} />,
    );
    rerender(<MapMarker longitude={151.21} latitude={-33.87} offset={[-18, 0]} />);

    expect(spies.setOffset).toHaveBeenLastCalledWith([-18, 0]);
    // A recreated marker would lose its popup binding and flicker; the create
    // effect depends only on `getMap` precisely to avoid that.
    expect(spies.constructed).toHaveBeenCalledTimes(1);
  });

  it('does not re-apply when a new array carries the same numbers', () => {
    // The parent rebuilds the offsets map on every camera settle, so a fresh
    // tuple with identical values arrives constantly — depending on the array
    // identity would fire this effect on every render.
    const { rerender } = render(
      <MapMarker longitude={151.21} latitude={-33.87} offset={[18, 0]} />,
    );
    spies.setOffset.mockClear();
    rerender(<MapMarker longitude={151.21} latitude={-33.87} offset={[18, 0]} />);
    expect(spies.setOffset).not.toHaveBeenCalled();
  });
});
