import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MapLassoSelect } from './MapLassoSelect';
import type { LassoPoint } from './MapLassoSelect';

vi.mock('@mapbox/mapbox-gl-draw', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getAll: vi.fn().mockReturnValue({ features: [] }),
      deleteAll: vi.fn(),
      changeMode: vi.fn(),
    })),
  };
});

const mockPoints: LassoPoint[] = [
  { id: 'p1', longitude: 151.2, latitude: -33.8 },
  { id: 'p2', longitude: 151.3, latitude: -33.9 },
];

function makeMockMap() {
  return {
    addControl: vi.fn(),
    removeControl: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
  } as unknown as mapboxgl.Map;
}

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
        map={mockMap}
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
        map={mockMap}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.addControl).toHaveBeenCalledTimes(1);
    expect(mockMap.on).toHaveBeenCalledWith('draw.create', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('draw.update', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('draw.delete', expect.any(Function));
  });

  it('disables map pan while drawing and re-enables otherwise', () => {
    const mockMap = makeMockMap();
    const { rerender } = render(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
      />,
    );
    expect((mockMap as any).dragPan.disable).toHaveBeenCalled();
    rerender(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        lassoState="review"
        onSelectionChange={vi.fn()}
      />,
    );
    expect((mockMap as any).dragPan.enable).toHaveBeenCalled();
  });

  it('persists the draw control through drawing → review', () => {
    const mockMap = makeMockMap();
    const { rerender } = render(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        lassoState="drawing"
        onSelectionChange={vi.fn()}
      />,
    );
    // Reset call counts; only count NEW addControl calls from here.
    (mockMap.addControl as ReturnType<typeof vi.fn>).mockClear();
    (mockMap.removeControl as ReturnType<typeof vi.fn>).mockClear();
    rerender(
      <MapLassoSelect
        map={mockMap}
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
        map={mockMap}
        points={mockPoints}
        lassoState="review"
        onSelectionChange={vi.fn()}
      />,
    );
    (mockMap.removeControl as ReturnType<typeof vi.fn>).mockClear();
    rerender(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        lassoState="idle"
        onSelectionChange={vi.fn()}
      />,
    );
    expect(mockMap.removeControl).toHaveBeenCalled();
  });
});
