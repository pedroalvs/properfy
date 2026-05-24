import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MapLassoSelect } from './MapLassoSelect';
import type { LassoPoint, MapLassoSelectHandle } from './MapLassoSelect';

// Capture the MapboxDraw constructor + instance methods so tests can
// assert mode transitions, deleteAll calls, etc.
const drawInstanceMock = {
  getAll: vi.fn().mockReturnValue({ features: [] }),
  deleteAll: vi.fn(),
  changeMode: vi.fn(),
  getMode: vi.fn().mockReturnValue('draw_polygon'),
};
vi.mock('@mapbox/mapbox-gl-draw', () => {
  return {
    default: vi.fn().mockImplementation(() => drawInstanceMock),
  };
});

const mockPoints: LassoPoint[] = [
  { id: 'p1', longitude: 151.2, latitude: -33.8 },
  { id: 'p2', longitude: 151.3, latitude: -33.9 },
];

function makeMockMap() {
  // Allow event handlers registered via `map.on(...)` to be captured so
  // tests can simulate the events.
  const listeners = new Map<string, ((...args: any[]) => void)[]>();
  return {
    listeners,
    addControl: vi.fn(),
    removeControl: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter((h) => h !== handler));
    }),
    fire: (event: string, ...args: any[]) => {
      (listeners.get(event) ?? []).forEach((h) => h(...args));
    },
    dragPan: { enable: vi.fn(), disable: vi.fn() },
  };
}

beforeEach(() => {
  drawInstanceMock.getAll.mockReturnValue({ features: [] });
  drawInstanceMock.deleteAll.mockClear();
  drawInstanceMock.changeMode.mockClear();
  drawInstanceMock.getMode.mockReturnValue('draw_polygon');
});

describe('MapLassoSelect (025 lassoState API)', () => {
  it('renders nothing (returns null)', () => {
    const { container } = render(
      <MapLassoSelect
        map={null}
        points={mockPoints}
        lassoState="idle"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('does not add draw control when map is null', () => {
    const onSelectionChange = vi.fn();
    render(
      <MapLassoSelect
        map={null}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('does not mount draw control while idle', () => {
    const mockMap = makeMockMap();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="idle"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.addControl).not.toHaveBeenCalled();
  });

  it('mounts draw control + wires events when transitioning to drawing', () => {
    const mockMap = makeMockMap();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.addControl).toHaveBeenCalledTimes(1);
    expect(mockMap.on).toHaveBeenCalledWith('draw.create', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('draw.update', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('draw.delete', expect.any(Function));
    // 025 cycle 2/2 — dblclick handler must be registered so the
    // operator's double-click reliably closes the polygon.
    expect(mockMap.on).toHaveBeenCalledWith('dblclick', expect.any(Function));
  });

  it('disables map pan while drawing and re-enables otherwise', () => {
    const mockMap = makeMockMap();
    const { rerender } = render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.dragPan.disable).toHaveBeenCalled();
    rerender(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="review"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.dragPan.enable).toHaveBeenCalled();
  });

  it('persists the draw control through drawing → review', () => {
    const mockMap = makeMockMap();
    const { rerender } = render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
      />,
    );
    mockMap.addControl.mockClear();
    mockMap.removeControl.mockClear();
    rerender(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="review"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.addControl).not.toHaveBeenCalled();
    expect(mockMap.removeControl).not.toHaveBeenCalled();
  });

  it('removes draw control on transition to idle', () => {
    const mockMap = makeMockMap();
    const { rerender } = render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="review"
        onSelectionChange={vi.fn()}
      />,
    );
    mockMap.removeControl.mockClear();
    rerender(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="idle"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.removeControl).toHaveBeenCalled();
  });
});

// 025 cycle 2/2 — explicit close-gesture coverage. The smoke regression
// was that mapbox-gl-draw's default close gestures (click-first-vertex
// on a ~5px target) are undiscoverable. These tests pin the new
// affordances: imperative API, dblclick handler, Enter / ESC keys.
describe('MapLassoSelect — close affordances (cycle 2/2)', () => {
  const validPolygonFeature = {
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [151.0, -34.0],
        [151.5, -34.0],
        [151.5, -33.5],
        [151.0, -33.5],
        [151.0, -34.0],
      ]],
    },
  };

  it('imperative finishDrawing() switches mode to simple_select + emits selection', () => {
    drawInstanceMock.getAll.mockReturnValue({ features: [validPolygonFeature] });
    const mockMap = makeMockMap();
    const onSelectionChange = vi.fn();
    const ref = createRef<MapLassoSelectHandle>();
    render(
      <MapLassoSelect
        ref={ref}
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={onSelectionChange}
      />,
    );

    ref.current!.finishDrawing();

    expect(drawInstanceMock.changeMode).toHaveBeenCalledWith('simple_select');
    // Both mockPoints are inside the polygon (151.0..151.5 / -34..-33.5).
    expect(onSelectionChange).toHaveBeenCalledWith(['p1', 'p2']);
  });

  it('imperative cancelDrawing() clears the polygon + fires onPolygonCleared', () => {
    const mockMap = makeMockMap();
    const onPolygonCleared = vi.fn();
    const ref = createRef<MapLassoSelectHandle>();
    render(
      <MapLassoSelect
        ref={ref}
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
        onPolygonCleared={onPolygonCleared}
      />,
    );

    ref.current!.cancelDrawing();

    expect(drawInstanceMock.deleteAll).toHaveBeenCalled();
    expect(onPolygonCleared).toHaveBeenCalled();
  });

  it('dblclick event during draw_polygon mode finishes the polygon', () => {
    drawInstanceMock.getAll.mockReturnValue({ features: [validPolygonFeature] });
    drawInstanceMock.getMode.mockReturnValue('draw_polygon');
    const mockMap = makeMockMap();
    const onSelectionChange = vi.fn();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={onSelectionChange}
      />,
    );

    mockMap.fire('dblclick');

    expect(drawInstanceMock.changeMode).toHaveBeenCalledWith('simple_select');
    expect(onSelectionChange).toHaveBeenCalledWith(['p1', 'p2']);
  });

  it('dblclick is a no-op outside draw_polygon mode (simple_select after review)', () => {
    drawInstanceMock.getMode.mockReturnValue('simple_select');
    const mockMap = makeMockMap();
    const onSelectionChange = vi.fn();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={onSelectionChange}
      />,
    );

    mockMap.fire('dblclick');

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('Enter key during drawing finishes the polygon', () => {
    drawInstanceMock.getAll.mockReturnValue({ features: [validPolygonFeature] });
    const mockMap = makeMockMap();
    const onSelectionChange = vi.fn();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(drawInstanceMock.changeMode).toHaveBeenCalledWith('simple_select');
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it('ESC key during drawing cancels the polygon', () => {
    const mockMap = makeMockMap();
    const onPolygonCleared = vi.fn();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
        onPolygonCleared={onPolygonCleared}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(drawInstanceMock.deleteAll).toHaveBeenCalled();
    expect(onPolygonCleared).toHaveBeenCalled();
  });

  it('Enter / ESC key are NO-OPs outside drawing state', () => {
    const mockMap = makeMockMap();
    const onSelectionChange = vi.fn();
    const onPolygonCleared = vi.fn();
    render(
      <MapLassoSelect
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="review"
        onSelectionChange={onSelectionChange}
        onPolygonCleared={onPolygonCleared}
      />,
    );

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onPolygonCleared).not.toHaveBeenCalled();
  });

  it('finishDrawing() is a no-op when the polygon has < 3 vertices', () => {
    drawInstanceMock.getAll.mockReturnValue({
      features: [{
        geometry: {
          type: 'Polygon',
          coordinates: [[[151.0, -34.0], [151.5, -34.0]]], // only 2 vertices
        },
      }],
    });
    const mockMap = makeMockMap();
    const onSelectionChange = vi.fn();
    const ref = createRef<MapLassoSelectHandle>();
    render(
      <MapLassoSelect
        ref={ref}
        map={mockMap as unknown as mapboxgl.Map}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={onSelectionChange}
      />,
    );

    ref.current!.finishDrawing();

    expect(drawInstanceMock.changeMode).not.toHaveBeenCalled();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
