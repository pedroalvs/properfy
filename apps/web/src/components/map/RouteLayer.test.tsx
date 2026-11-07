import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { DayPlanGeometry } from '@properfy/shared';
import { RouteLayer } from './RouteLayer';

/**
 * Fake Popup so the component's hover tooltip can be asserted without a real
 * mapbox runtime. Captures the last text and tracks add/remove.
 */
const popupSpies = vi.hoisted(() => ({
  setLngLat: vi.fn(),
  setText: vi.fn(),
  addTo: vi.fn(),
  remove: vi.fn(),
  created: vi.fn(),
}));

vi.mock('mapbox-gl', () => {
  class FakePopup {
    constructor(opts?: unknown) {
      popupSpies.created(opts);
    }
    setLngLat(v: unknown) {
      popupSpies.setLngLat(v);
      return this;
    }
    setText(v: string) {
      popupSpies.setText(v);
      return this;
    }
    addTo(m: unknown) {
      popupSpies.addTo(m);
      return this;
    }
    remove() {
      popupSpies.remove();
      return this;
    }
  }
  return { default: { Popup: FakePopup }, Popup: FakePopup };
});

/**
 * Fake map. `on`/`off` accept BOTH the 2-arg style-event form (`on('style.load', h)`)
 * and the 3-arg layer form (`on('click', layerId, h)`), keyed by `event|layer`.
 */
function makeMockMap(opts?: { styleLoaded?: boolean; symbolLayer?: string }) {
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  let layers: Array<{ id: string; type: string }> = [
    { id: 'water', type: 'fill' },
    { id: opts?.symbolLayer ?? 'road-label', type: 'symbol' },
  ];
  const canvas = { style: { cursor: '' } };

  const key = (event: string, layer?: string) => (layer ? `${event}|${layer}` : event);

  const map = {
    _layers: () => layers,
    isStyleLoaded: vi.fn(() => opts?.styleLoaded ?? true),
    getStyle: vi.fn(() => ({ layers })),
    getCanvas: vi.fn(() => canvas),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, _s?: unknown) => {
      sources.set(id, { setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    getLayer: vi.fn((id: string) => layers.find((l) => l.id === id)),
    addLayer: vi.fn((layer: { id: string; type: string }, beforeId?: string) => {
      if (beforeId) {
        const idx = layers.findIndex((l) => l.id === beforeId);
        layers = [...layers.slice(0, idx), layer, ...layers.slice(idx)];
      } else {
        layers = [...layers, layer];
      }
    }),
    removeLayer: vi.fn((id: string) => {
      layers = layers.filter((l) => l.id !== id);
    }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    on: vi.fn((event: string, a: unknown, b?: unknown) => {
      const layer = typeof a === 'string' ? a : undefined;
      const handler = (typeof a === 'string' ? b : a) as (...x: unknown[]) => void;
      const k = key(event, layer);
      const arr = listeners.get(k) ?? [];
      arr.push(handler);
      listeners.set(k, arr);
    }),
    off: vi.fn((event: string, a: unknown, b?: unknown) => {
      const layer = typeof a === 'string' ? a : undefined;
      const handler = (typeof a === 'string' ? b : a) as (...x: unknown[]) => void;
      const k = key(event, layer);
      listeners.set(k, (listeners.get(k) ?? []).filter((h) => h !== handler));
    }),
    fire: (event: string, layer?: string, ...args: unknown[]) => {
      [...(listeners.get(key(event, layer)) ?? [])].forEach((h) => h(...args));
    },
    canvas,
    listeners,
  };
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMap = (m: ReturnType<typeof makeMockMap>) => m as any;

const geom = (approximate: boolean): DayPlanGeometry => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { fromSequence: 1, toSequence: 2, approximate },
      geometry: { type: 'LineString', coordinates: [[151.2, -33.8], [151.3, -33.9]] },
    },
  ],
});

const COLOR = 'hsl(200, 85%, 30%)';
const ID = 'live-route-abc';

beforeEach(() => {
  popupSpies.setLngLat.mockClear();
  popupSpies.setText.mockClear();
  popupSpies.addTo.mockClear();
  popupSpies.remove.mockClear();
  popupSpies.created.mockClear();
});

describe('RouteLayer', () => {
  it('R1: adds a geojson source and solid + dashed line layers with the right filters', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);

    expect(map.addSource).toHaveBeenCalledWith(ID, expect.objectContaining({ type: 'geojson' }));
    const solid = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === `${ID}-solid`)![0] as unknown as {
      filter: unknown;
      paint: Record<string, unknown>;
      layout: Record<string, unknown>;
    };
    expect(solid.filter).toEqual(['!=', ['get', 'approximate'], true]);
    expect(solid.layout['line-cap']).toBe('round');
    const dashed = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === `${ID}-dashed`)![0] as unknown as {
      filter: unknown;
      paint: Record<string, unknown>;
    };
    expect(dashed.filter).toEqual(['==', ['get', 'approximate'], true]);
    expect(dashed.paint['line-dasharray']).toEqual([1.5, 1.5]);
  });

  it('R2: line-color is the comma-form HSL string it received', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    const solid = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === `${ID}-solid`)![0] as unknown as {
      paint: Record<string, unknown>;
    };
    expect(solid.paint['line-color']).toBe(COLOR);
    expect(COLOR).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  it('R2a: a space-form HSL console.errors and never reaches paint', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color="hsl(0 70% 38%)" />);
    expect(spy).toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('R3: inserts the layers before the first symbol layer', () => {
    const map = makeMockMap({ symbolLayer: 'road-label' });
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: `${ID}-solid` }),
      'road-label',
    );
  });

  it('R4: re-render with new geometry calls setData, not addSource again', () => {
    const map = makeMockMap();
    const { rerender } = render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    rerender(<RouteLayer map={asMap(map)} id={ID} geometry={geom(false)} color={COLOR} />);
    expect(map.getSource(ID)!.setData).toHaveBeenCalledTimes(1);
    expect(map.addSource).toHaveBeenCalledTimes(1);
  });

  it('R5: geometry null sets an empty FeatureCollection', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={null} color={COLOR} />);
    const srcArg = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection };
    expect(srcArg.data.type).toBe('FeatureCollection');
    expect(srcArg.data.features).toHaveLength(0);
  });

  it('R6: unmount removes both line layers and the source and off()s handlers', () => {
    const map = makeMockMap();
    const { unmount } = render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    unmount();
    expect(map.removeLayer).toHaveBeenCalledWith(`${ID}-solid`);
    expect(map.removeLayer).toHaveBeenCalledWith(`${ID}-dashed`);
    expect(map.removeSource).toHaveBeenCalledWith(ID);
    expect(map.off).toHaveBeenCalledWith('click', `${ID}-solid`, expect.any(Function));
  });

  it('R7: onClick wires click handlers on both line layers and off on unmount', () => {
    const onClick = vi.fn();
    const map = makeMockMap();
    const { unmount } = render(
      <RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} onClick={onClick} />,
    );
    expect(map.on).toHaveBeenCalledWith('click', `${ID}-solid`, expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('click', `${ID}-dashed`, expect.any(Function));
    map.fire('click', `${ID}-solid`, { lngLat: { lng: 151.2, lat: -33.8 } });
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
    expect(map.off).toHaveBeenCalledWith('click', `${ID}-solid`, expect.any(Function));
  });

  it('R8: mouseenter sets the pointer cursor', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    map.fire('mouseenter', `${ID}-solid`, { lngLat: { lng: 151.2, lat: -33.8 } });
    expect(map.getCanvas().style.cursor).toBe('pointer');
    map.fire('mouseleave', `${ID}-solid`);
    expect(map.getCanvas().style.cursor).toBe('');
  });

  it('R9: emphasis="selected" uses width 5; "muted" uses opacity 0.35', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} emphasis="selected" />);
    const solid = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === `${ID}-solid`)![0] as unknown as {
      paint: Record<string, unknown>;
    };
    expect(solid.paint['line-width']).toBe(5);

    const map2 = makeMockMap();
    render(<RouteLayer map={asMap(map2)} id="r2" geometry={geom(true)} color={COLOR} emphasis="muted" />);
    const solid2 = map2.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === 'r2-solid')![0] as unknown as {
      paint: Record<string, unknown>;
    };
    expect(solid2.paint['line-opacity']).toBe(0.35);
  });

  it('R9a: changing emphasis updates paint via setPaintProperty, not re-add', () => {
    const map = makeMockMap();
    const { rerender } = render(
      <RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} emphasis="normal" />,
    );
    map.addLayer.mockClear();
    rerender(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} emphasis="selected" />);
    expect(map.setPaintProperty).toHaveBeenCalledWith(`${ID}-solid`, 'line-width', 5);
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it('R10: stops variant "dots" adds a circle layer with radius 4 and white stroke', () => {
    const map = makeMockMap();
    render(
      <RouteLayer
        map={asMap(map)}
        id={ID}
        geometry={geom(true)}
        color={COLOR}
        stops={{ variant: 'dots', points: [[151.2, -33.8], [151.3, -33.9]] }}
      />,
    );
    const circle = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === `${ID}-stops`)![0] as unknown as {
      type: string;
      paint: Record<string, unknown>;
    };
    expect(circle.type).toBe('circle');
    expect(circle.paint['circle-radius']).toBe(4);
    expect(circle.paint['circle-color']).toBe(COLOR);
    expect(circle.paint['circle-stroke-color']).toBe('#FFFFFF');
  });

  it('R11: hover with a label opens a popup with the name and closes on leave', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} label="Jane Doe" />);
    map.fire('mouseenter', `${ID}-solid`, { lngLat: { lng: 151.2, lat: -33.8 } });
    expect(popupSpies.setText).toHaveBeenCalledWith('Jane Doe');
    expect(popupSpies.addTo).toHaveBeenCalled();
    map.fire('mouseleave', `${ID}-solid`);
    expect(popupSpies.remove).toHaveBeenCalled();
  });

  it('R11a: no label means no popup on hover', () => {
    const map = makeMockMap();
    render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    map.fire('mouseenter', `${ID}-solid`, { lngLat: { lng: 151.2, lat: -33.8 } });
    expect(popupSpies.addTo).not.toHaveBeenCalled();
  });

  it('R12: re-adds source + layers on style.load with the latest geometry', () => {
    const map = makeMockMap();
    const { rerender } = render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    rerender(<RouteLayer map={asMap(map)} id={ID} geometry={geom(false)} color={COLOR} />);
    map.removeLayer(`${ID}-solid`);
    map.removeLayer(`${ID}-dashed`);
    map.removeSource(ID);
    map.addSource.mockClear();
    map.addLayer.mockClear();
    map.fire('style.load');
    expect(map.addSource).toHaveBeenCalledTimes(1);
  });

  it('R13: does nothing and renders no DOM when map is null', () => {
    const { container } = render(<RouteLayer map={null} id={ID} geometry={geom(true)} color={COLOR} />);
    expect(container.innerHTML).toBe('');
  });

  it('R14: renders no DOM', () => {
    const map = makeMockMap();
    const { container } = render(<RouteLayer map={asMap(map)} id={ID} geometry={geom(true)} color={COLOR} />);
    expect(container.innerHTML).toBe('');
  });
});
