import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// --- Hoisted mocks (vi.mock is hoisted, so shared state must be too) ---

const { mockOn, mockRemove, mockAddControl, MockMap, MockNavigationControl, mockEnv } = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockRemove = vi.fn();
  const mockAddControl = vi.fn();
  const MockMap = vi.fn().mockImplementation(() => ({
    on: mockOn,
    remove: mockRemove,
    addControl: mockAddControl,
  }));
  const MockNavigationControl = vi.fn();
  const mockEnv = { mapboxToken: 'test-token-123', apiBaseUrl: '' };
  return { mockOn, mockRemove, mockAddControl, MockMap, MockNavigationControl, mockEnv };
});

vi.mock('mapbox-gl', () => ({
  default: {
    Map: MockMap,
    NavigationControl: MockNavigationControl,
    accessToken: '',
  },
}));

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

vi.mock('@/config/env', () => ({
  env: mockEnv,
}));

import { MapContainer } from './MapContainer';

describe('MapContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.mapboxToken = 'test-token-123';
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes mapbox-gl Map when token is present', () => {
    render(<MapContainer />);

    expect(MockMap).toHaveBeenCalledTimes(1);
    expect(MockMap).toHaveBeenCalledWith(
      expect.objectContaining({
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [133.7751, -25.2744],
        zoom: 4,
      }),
    );
  });

  it('initializes with custom view state', () => {
    render(
      <MapContainer
        initialViewState={{ longitude: 151.2093, latitude: -33.8688, zoom: 12 }}
      />,
    );

    expect(MockMap).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [151.2093, -33.8688],
        zoom: 12,
      }),
    );
  });

  it('adds navigation control', () => {
    render(<MapContainer />);

    expect(mockAddControl).toHaveBeenCalledWith(
      expect.any(Object),
      'top-right',
    );
    expect(MockNavigationControl).toHaveBeenCalled();
  });

  it('calls onMapReady when map fires load event', () => {
    const onMapReady = vi.fn();

    render(<MapContainer onMapReady={onMapReady} />);

    const loadCall = mockOn.mock.calls.find(([event]: string[]) => event === 'load');
    expect(loadCall).toBeDefined();

    act(() => {
      loadCall![1]();
    });

    expect(onMapReady).toHaveBeenCalledTimes(1);
  });

  it('calls onMapClick when map fires click event', () => {
    const onMapClick = vi.fn();

    render(<MapContainer onMapClick={onMapClick} />);

    const clickCall = mockOn.mock.calls.find(([event]: string[]) => event === 'click');
    expect(clickCall).toBeDefined();

    clickCall![1]({ lngLat: { lng: 151.0, lat: -33.0 } });

    expect(onMapClick).toHaveBeenCalledWith(151.0, -33.0);
  });

  it('shows error message when mapbox token is missing', () => {
    mockEnv.mapboxToken = '';

    render(<MapContainer />);

    expect(screen.getByTestId('map-token-error')).toBeInTheDocument();
    expect(screen.getByText('Mapbox token not configured')).toBeInTheDocument();
  });

  it('does not initialize map when token is missing', () => {
    mockEnv.mapboxToken = '';

    render(<MapContainer />);

    expect(MockMap).not.toHaveBeenCalled();
  });

  it('calls map.remove() on unmount', () => {
    const { unmount } = render(<MapContainer />);

    unmount();

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('has accessible role and label', () => {
    render(<MapContainer />);
    const container = screen.getByRole('application', { name: 'Map' });
    expect(container).toBeInTheDocument();
  });

  it('shows loading overlay before map is ready', () => {
    render(<MapContainer />);
    expect(screen.getByText('Loading map...')).toBeInTheDocument();
  });

  it('renders children after map is ready', () => {
    render(
      <MapContainer>
        <div data-testid="child-marker">Marker</div>
      </MapContainer>,
    );

    // Trigger load event to set mapReady
    const loadCall = mockOn.mock.calls.find(([event]: string[]) => event === 'load');
    act(() => {
      loadCall![1]();
    });

    expect(screen.getByTestId('child-marker')).toBeInTheDocument();
  });
});
