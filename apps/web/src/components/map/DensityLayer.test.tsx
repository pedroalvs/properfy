import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  DensityLayer,
  DENSITY_SOURCE_ID,
  DENSITY_LAYER_ID,
  type DensityCell,
} from './DensityLayer';

/**
 * Fake Mapbox map. The style's layer stack is a plain array in Mapbox render
 * order (index 0 = bottom, last = top). The fake tracks source/layer presence
 * so add/remove/move assertions are meaningful, and captures `on`/`off`
 * handlers so tests can fire `style.load` / `styledata`.
 */
function makeMockMap(opts?: { styleLoaded?: boolean; drawLayers?: string[] }) {
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  // Layer stack, bottom → top. Seed any draw layers the test wants present.
  let layers: Array<{ id: string }> = (opts?.drawLayers ?? []).map((id) => ({ id }));

  const map = {
    _layers: () => layers,
    isStyleLoaded: vi.fn(() => opts?.styleLoaded ?? true),
    getStyle: vi.fn(() => ({ layers })),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, _source?: unknown) => {
      sources.set(id, { setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    getLayer: vi.fn((id: string) => layers.find((l) => l.id === id)),
    addLayer: vi.fn((layer: { id: string }, beforeId?: string) => {
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
    moveLayer: vi.fn((id: string, beforeId?: string) => {
      const moving = layers.find((l) => l.id === id);
      if (!moving) return;
      layers = layers.filter((l) => l.id !== id);
      if (beforeId) {
        const idx = layers.findIndex((l) => l.id === beforeId);
        layers = [...layers.slice(0, idx), moving, ...layers.slice(idx)];
      } else {
        layers = [...layers, moving];
      }
    }),
    setPaintProperty: vi.fn(),
    on: vi.fn((event: string, handler: (...a: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    }),
    off: vi.fn((event: string, handler: (...a: unknown[]) => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((h) => h !== handler));
    }),
    fire: (event: string, ...args: unknown[]) => {
      [...(listeners.get(event) ?? [])].forEach((h) => h(...args));
    },
    listeners,
  };
  return map;
}

const twoCells: DensityCell[] = [
  { lat: -33.8685, lng: 151.2095, count: 3 },
  { lat: -33.8695, lng: 151.2105, count: 1 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMap = (m: ReturnType<typeof makeMockMap>) => m as any;

describe('DensityLayer', () => {
  it('L1: adds source + heatmap layer with two Point features and no beforeId when no draw layers', () => {
    const map = makeMockMap();
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);

    expect(map.addSource).toHaveBeenCalledWith(
      DENSITY_SOURCE_ID,
      expect.objectContaining({ type: 'geojson' }),
    );
    const srcArg = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection };
    expect(srcArg.data.type).toBe('FeatureCollection');
    expect(srcArg.data.features).toHaveLength(2);
    const f0 = srcArg.data.features[0]! as GeoJSON.Feature<GeoJSON.Point>;
    expect(f0.geometry.coordinates).toEqual([151.2095, -33.8685]);
    expect(f0.properties).toEqual({ count: 3 });

    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: DENSITY_LAYER_ID, type: 'heatmap', source: DENSITY_SOURCE_ID }),
      undefined,
    );
  });

  it('L2: inserts below the first gl-draw-* layer when the lasso is present', () => {
    const map = makeMockMap({ drawLayers: ['gl-draw-polygon-fill-properfy.cold'] });
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: DENSITY_LAYER_ID }),
      'gl-draw-polygon-fill-properfy.cold',
    );
  });

  it('L3: rerender with new cells calls setData, not addSource/addLayer again', () => {
    const map = makeMockMap();
    const { rerender } = render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    expect(map.addSource).toHaveBeenCalledTimes(1);

    const next: DensityCell[] = [{ lat: 0.0005, lng: 0.0005, count: 2 }];
    rerender(<DensityLayer map={asMap(map)} cells={next} visible />);

    const src = map.getSource(DENSITY_SOURCE_ID)!;
    expect(src.setData).toHaveBeenCalledTimes(1);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
  });

  it('L4: updates heatmap-weight via setPaintProperty when maxCount changes', () => {
    const map = makeMockMap();
    const { rerender } = render(
      <DensityLayer map={asMap(map)} cells={[{ lat: 1, lng: 1, count: 3 }]} visible />,
    );
    rerender(
      <DensityLayer map={asMap(map)} cells={[{ lat: 1, lng: 1, count: 10 }]} visible />,
    );
    const weightCall = map.setPaintProperty.mock.calls.find(
      (c) => c[0] === DENSITY_LAYER_ID && c[1] === 'heatmap-weight',
    );
    expect(weightCall).toBeDefined();
    expect(JSON.stringify(weightCall![2])).toContain('10');
  });

  it('L5: removes layer + source when visible becomes false', () => {
    const map = makeMockMap();
    const { rerender } = render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    map.addLayer.mockClear();
    rerender(<DensityLayer map={asMap(map)} cells={twoCells} visible={false} />);
    expect(map.removeLayer).toHaveBeenCalledWith(DENSITY_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalledWith(DENSITY_SOURCE_ID);
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it('L6 + L6a: unmount removes handlers (style.load and styledata) and cleans up without throwing', () => {
    const map = makeMockMap();
    const { unmount } = render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    // getStyle throws after remove() — cleanup must swallow it.
    map.getStyle.mockImplementation(() => {
      throw new Error('map removed');
    });
    expect(() => unmount()).not.toThrow();
    expect(map.off).toHaveBeenCalledWith('style.load', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('styledata', expect.any(Function));
  });

  it('L7: re-creates source + layer with the latest cells on style.load', () => {
    const map = makeMockMap();
    const { rerender } = render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    const latest: DensityCell[] = [{ lat: 2, lng: 2, count: 5 }];
    rerender(<DensityLayer map={asMap(map)} cells={latest} visible />);

    // Simulate a setStyle wiping the source/layer.
    map.removeLayer(DENSITY_LAYER_ID);
    map.removeSource(DENSITY_SOURCE_ID);
    map.addSource.mockClear();
    map.addLayer.mockClear();

    map.fire('style.load');
    expect(map.addSource).toHaveBeenCalledTimes(1);
    const srcArg = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection };
    expect(srcArg.data.features).toHaveLength(1);
    // No draw layers at this instant → no beforeId.
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: DENSITY_LAYER_ID }),
      undefined,
    );
  });

  it('L7a: styledata moves density below the first gl-draw-* once when a draw layer is below it', () => {
    const map = makeMockMap();
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    // density is now on top; the draw control re-adds its layer BELOW density.
    map._layers().unshift({ id: 'gl-draw-polygon-fill-properfy.cold' });
    map.fire('styledata');
    expect(map.moveLayer).toHaveBeenCalledWith(
      DENSITY_LAYER_ID,
      'gl-draw-polygon-fill-properfy.cold',
    );
    // Idempotent: a second styledata with density already below does nothing more.
    map.moveLayer.mockClear();
    map.fire('styledata');
    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it('L7b: styledata does nothing when density is already below all gl-draw-*', () => {
    const map = makeMockMap({ drawLayers: ['gl-draw-polygon-fill-properfy.cold'] });
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    // added with beforeId, so density sits below the draw layer already.
    map.moveLayer.mockClear();
    map.fire('styledata');
    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it('L7c: styledata does nothing when the lasso was enabled after density (draw already on top)', () => {
    const map = makeMockMap();
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    // draw adds its layer ON TOP (end of the stack) — density already below it.
    map._layers().push({ id: 'gl-draw-polygon-fill-properfy.cold' });
    map.moveLayer.mockClear();
    map.fire('styledata');
    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it('L7d: styledata does nothing when the density layer is absent (toggle off)', () => {
    const map = makeMockMap();
    const { rerender } = render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    rerender(<DensityLayer map={asMap(map)} cells={twoCells} visible={false} />);
    map.moveLayer.mockClear();
    map.addLayer.mockClear();
    map._layers().push({ id: 'gl-draw-polygon-fill-properfy.cold' });
    map.fire('styledata');
    expect(map.moveLayer).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
  });

  it('L8: waits for style.load when the style is not ready at mount', () => {
    const map = makeMockMap({ styleLoaded: false });
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    expect(map.addSource).not.toHaveBeenCalled();
    map.isStyleLoaded.mockReturnValue(true);
    map.fire('style.load');
    expect(map.addSource).toHaveBeenCalledTimes(1);
  });

  it('L9: does nothing and registers no handler when map is null', () => {
    const { container } = render(<DensityLayer map={null} cells={twoCells} visible />);
    expect(container.innerHTML).toBe('');
  });

  it('L10: every heatmap-color stop is comma-form HSL, never space-form', () => {
    const map = makeMockMap();
    render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    const layerArg = map.addLayer.mock.calls[0]![0] as unknown as {
      paint: Record<string, unknown>;
    };
    const colorExpr = layerArg.paint['heatmap-color'] as unknown[];
    // Colour stops are the hsl… strings; 'interpolate'/'linear' are operators.
    const colorStrings = colorExpr.filter(
      (x): x is string => typeof x === 'string' && x.includes('hsl'),
    );
    expect(colorStrings.length).toBeGreaterThan(0);
    for (const c of colorStrings) {
      expect(c).toMatch(/^hsla?\(\d+, \d+%, \d+%(, [\d.]+)?\)$/);
      expect(c).not.toMatch(/hsl\(\s*\d+\s+\d+%\s+\d+%/); // no space-form
    }
  });

  it('L11: creates an empty FeatureCollection source when visible with no cells', () => {
    const map = makeMockMap();
    render(<DensityLayer map={asMap(map)} cells={[]} visible />);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    const srcArg = map.addSource.mock.calls[0]![1] as { data: GeoJSON.FeatureCollection };
    expect(srcArg.data.features).toHaveLength(0);
  });

  it('L12: renders no DOM', () => {
    const map = makeMockMap();
    const { container } = render(<DensityLayer map={asMap(map)} cells={twoCells} visible />);
    expect(container.innerHTML).toBe('');
  });
});
