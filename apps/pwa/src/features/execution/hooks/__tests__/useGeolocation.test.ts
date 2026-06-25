import { renderHook, act } from '@testing-library/react';
import { useGeolocation } from '../useGeolocation';

describe('useGeolocation', () => {
  const mockGetCurrentPosition = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: mockGetCurrentPosition,
      },
    });
    mockGetCurrentPosition.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('captures location on success', async () => {
    mockGetCurrentPosition.mockImplementation((success) => {
      success({
        coords: { latitude: -37.8, longitude: 144.9, accuracy: 10 },
      });
    });

    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    expect(result.current.status).toBe('success');
    expect(result.current.location).toMatchObject({
      latitude: -37.8,
      longitude: 144.9,
      accuracy: 10,
    });
  });

  it('handles permission denied', () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1 });
    });

    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.error).toContain('permission denied');
  });

  it('handles position unavailable', () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 2, POSITION_UNAVAILABLE: 2 });
    });

    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('unavailable');
  });

  it('handles timeout', () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 3, TIMEOUT: 3 });
    });

    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('timed out');
  });
});
