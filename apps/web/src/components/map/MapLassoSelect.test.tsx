import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MapLassoSelect } from './MapLassoSelect';
import type { LassoPoint } from './MapLassoSelect';

vi.mock('@mapbox/mapbox-gl-draw', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getAll: vi.fn().mockReturnValue({ features: [] }),
      deleteAll: vi.fn(),
    })),
  };
});

const mockPoints: LassoPoint[] = [
  { id: 'p1', longitude: 151.2, latitude: -33.8 },
  { id: 'p2', longitude: 151.3, latitude: -33.9 },
];

describe('MapLassoSelect', () => {
  it('renders nothing (returns null)', () => {
    const { container } = render(
      <MapLassoSelect
        map={null}
        points={mockPoints}
        active={false}
        onSelectionChange={vi.fn()}
        onDeactivate={vi.fn()}
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
        active={true}
        onSelectionChange={onSelectionChange}
        onDeactivate={vi.fn()}
      />,
    );
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('does not add draw control when not active', () => {
    const mockMap = {
      addControl: vi.fn(),
      removeControl: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as mapboxgl.Map;

    render(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        active={false}
        onSelectionChange={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    expect(mockMap.addControl).not.toHaveBeenCalled();
  });

  it('adds draw control when active with valid map', () => {
    const mockMap = {
      addControl: vi.fn(),
      removeControl: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as mapboxgl.Map;

    render(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        active={true}
        onSelectionChange={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    expect(mockMap.addControl).toHaveBeenCalledTimes(1);
    expect(mockMap.on).toHaveBeenCalledWith('draw.create', expect.any(Function));
    expect(mockMap.on).toHaveBeenCalledWith('draw.update', expect.any(Function));
  });

  it('removes draw control on cleanup', () => {
    const mockMap = {
      addControl: vi.fn(),
      removeControl: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as mapboxgl.Map;

    const { unmount } = render(
      <MapLassoSelect
        map={mockMap}
        points={mockPoints}
        active={true}
        onSelectionChange={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    unmount();
    expect(mockMap.removeControl).toHaveBeenCalled();
    expect(mockMap.off).toHaveBeenCalledWith('draw.create', expect.any(Function));
    expect(mockMap.off).toHaveBeenCalledWith('draw.update', expect.any(Function));
  });
});
