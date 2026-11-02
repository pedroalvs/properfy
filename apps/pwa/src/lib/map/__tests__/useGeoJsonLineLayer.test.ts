import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useGeoJsonLineLayer } from '../useGeoJsonLineLayer';

interface FakeSource {
  setData: ReturnType<typeof vi.fn>;
}

function createFakeMap() {
  const sources = new Map<string, FakeSource>();
  const layers: Array<Record<string, unknown>> = [];
  const map = {
    addSource: vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() });
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addLayer: vi.fn((layer: Record<string, unknown>) => {
      layers.push(layer);
    }),
  };
  return { map, sources, layers };
}

const SOURCE = 'day-plan-route';

function lineString(approximate: boolean): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2, -33.87], [151.21, -33.88]] },
    properties: { approximate },
  };
}

const twoLegs: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [lineString(false), lineString(true)],
};

describe('useGeoJsonLineLayer', () => {
  it('adds one source and two filtered layers (solid + dashed) with comma-form HSL', () => {
    const { map, layers } = createFakeMap();
    renderHook(() =>
      useGeoJsonLineLayer({
        mapRef: { current: map as unknown as MapboxMap },
        mapLoadedRef: { current: true },
        mapReady: true,
        sourceId: SOURCE,
        data: twoLegs,
      }),
    );

    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(layers).toHaveLength(2);
    const solid = layers.find((l) => l.id === `${SOURCE}-solid`)!;
    const dashed = layers.find((l) => l.id === `${SOURCE}-dashed`)!;
    expect(solid.filter).toEqual(['!=', ['get', 'approximate'], true]);
    expect(dashed.filter).toEqual(['==', ['get', 'approximate'], true]);
    expect((dashed.paint as Record<string, unknown>)['line-dasharray']).toEqual([0.5, 2]);
    const color = (solid.paint as Record<string, string>)['line-color'];
    expect(color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$|^#2563EB$/);
    // No space-separated HSL, which blanks the whole map (#1302).
    expect(color).not.toMatch(/\d\s+\d/);
  });

  it('pushes the received FeatureCollection to the source and updates it on change', () => {
    const { map, sources } = createFakeMap();
    const { rerender } = renderHook(
      ({ data }: { data: GeoJSON.FeatureCollection | null }) =>
        useGeoJsonLineLayer({
          mapRef: { current: map as unknown as MapboxMap },
          mapLoadedRef: { current: true },
          mapReady: true,
          sourceId: SOURCE,
          data,
        }),
      { initialProps: { data: twoLegs } },
    );
    const source = sources.get(SOURCE)!;
    expect(source.setData).toHaveBeenLastCalledWith(twoLegs);

    const oneLeg: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [lineString(false)] };
    rerender({ data: oneLeg });
    expect(source.setData).toHaveBeenLastCalledWith(oneLeg);
    // Source is added once, not re-added on data change.
    expect(map.addSource).toHaveBeenCalledTimes(1);
  });

  it('clears the line to an empty FeatureCollection when data is null', () => {
    const { map, sources } = createFakeMap();
    renderHook(() =>
      useGeoJsonLineLayer({
        mapRef: { current: map as unknown as MapboxMap },
        mapLoadedRef: { current: true },
        mapReady: true,
        sourceId: SOURCE,
        data: null,
      }),
    );
    expect(sources.get(SOURCE)!.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
  });

  it('re-adds the source and layers on a fresh map after a retry', () => {
    const first = createFakeMap();
    const { rerender } = renderHook(
      ({ map, ready }: { map: ReturnType<typeof createFakeMap>['map']; ready: boolean }) =>
        useGeoJsonLineLayer({
          mapRef: { current: map as unknown as MapboxMap },
          mapLoadedRef: { current: true },
          mapReady: ready,
          sourceId: SOURCE,
          data: twoLegs,
        }),
      { initialProps: { map: first.map, ready: true } },
    );
    expect(first.map.addSource).toHaveBeenCalledTimes(1);

    const second = createFakeMap();
    rerender({ map: second.map, ready: false });
    expect(second.map.addSource).toHaveBeenCalledTimes(1);
    expect(second.layers).toHaveLength(2);
  });
});
