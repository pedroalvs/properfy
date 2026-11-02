import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useMapCamera, computeCenter, AU_CENTRE, type MapCameraPoint } from '../useMapCamera';

function fakeMap() {
  return { flyTo: vi.fn(), fitBounds: vi.fn() };
}

const SYDNEY: MapCameraPoint = { id: 'a', lat: -33.87, lng: 151.21 };
const SURRY: MapCameraPoint = { id: 'b', lat: -33.88, lng: 151.2 };
const REDFERN: MapCameraPoint = { id: 'c', lat: -33.89, lng: 151.19 };

describe('computeCenter', () => {
  it('returns the centre of Australia when there are no plottable points', () => {
    expect(computeCenter([])).toEqual(AU_CENTRE);
    expect(computeCenter([{ lat: null, lng: null }])).toEqual(AU_CENTRE);
  });

  it('averages the plottable points', () => {
    const [lng, lat] = computeCenter([SYDNEY, SURRY]);
    expect(lng).toBeCloseTo(151.205, 3);
    expect(lat).toBeCloseTo(-33.875, 3);
  });
});

describe('useMapCamera', () => {
  it('flyTo at the single-point zoom for one point', () => {
    const map = fakeMap();
    const { result } = renderHook(() => useMapCamera({ points: [SYDNEY] }));
    act(() => result.current.syncCamera(map as unknown as MapboxMap));
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 15 }));
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('fitBounds with padding 48 and maxZoom 15 for several points', () => {
    const map = fakeMap();
    const { result } = renderHook(() => useMapCamera({ points: [SYDNEY, SURRY, REDFERN] }));
    act(() => result.current.syncCamera(map as unknown as MapboxMap));
    expect(map.fitBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ padding: 48, maxZoom: 15 }));
  });

  it('does not re-frame after a user gesture, and refit() forces it again', () => {
    const map = fakeMap();
    const { result, rerender } = renderHook(({ points }: { points: MapCameraPoint[] }) => useMapCamera({ points }), {
      initialProps: { points: [SYDNEY, SURRY] },
    });
    act(() => result.current.syncCamera(map as unknown as MapboxMap));
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    act(() => result.current.markUserMoved());
    // New points (keeping a framed id) must not yank the camera after a gesture.
    rerender({ points: [SYDNEY, SURRY, REDFERN] });
    act(() => result.current.syncCamera(map as unknown as MapboxMap));
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    act(() => result.current.refit());
    act(() => result.current.syncCamera(map as unknown as MapboxMap));
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });
});
