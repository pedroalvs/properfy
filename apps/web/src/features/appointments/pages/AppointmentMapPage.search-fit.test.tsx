/**
 * Enter in a filter text field frames the current results.
 *
 * This is the escape hatch for a deliberate design choice: the auto-fit effect
 * fires ONCE per (mode, map) pair so that a background refetch can never undo a
 * per-marker flyTo. The side effect is that filtering alone never moves the
 * camera — a searched pin can sit off-screen with no feedback. Enter is the
 * operator's explicit "show me where these are".
 *
 * The camera assertions run against a mocked mapbox-gl instance, following the
 * same hoisted-mock pattern as MapContainer.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';

const { mapApi, MockMap, mockEnv } = vi.hoisted(() => {
  const mapApi = {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn(() => 4),
    // The page projects pin coordinates to screen space to de-collide markers.
    // Any deterministic transform will do here — this suite is about framing.
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng * 1000, y: -lat * 1000 })),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
  };
  const MockMap = vi.fn().mockImplementation(() => mapApi);
  return { mapApi, MockMap, mockEnv: { mapboxToken: 'test-token', apiBaseUrl: '' } };
});

const markerApi = vi.hoisted(() => ({
  setLngLat: vi.fn().mockReturnThis(),
  setOffset: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
  remove: vi.fn(),
  getElement: vi.fn(() => document.createElement('div')),
}));

vi.mock('mapbox-gl', () => ({
  default: {
    Map: MockMap,
    NavigationControl: vi.fn(),
    Marker: vi.fn().mockImplementation(() => markerApi),
    Popup: vi.fn().mockImplementation(() => ({
      setLngLat: vi.fn().mockReturnThis(),
      setDOMContent: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      setOffset: vi.fn().mockReturnThis(),
    })),
    accessToken: '',
  },
}));

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));
vi.mock('@/config/env', () => ({ env: mockEnv }));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test', email: 't@e.com', role: 'AM', tenantId: null },
    token: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { api } from '@/services/api';
import { AppointmentMapPage } from './AppointmentMapPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function appointment(id: string, latitude: number, longitude: number) {
  return {
    id,
    code: `VST-${id}`,
    status: 'SCHEDULED',
    address: `${id} Test St`,
    latitude,
    longitude,
    scheduledDate: '2026-04-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    inspectorName: 'John Smith',
    branchName: 'Central',
  };
}

function mockAppointments(items: unknown[]) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/v1/appointments') {
      return {
        data: { data: items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: 1 } },
      };
    }
    return { data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/map']}>
          <AppointmentMapPage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

/** MapContainer only renders children once mapbox fires `load`. */
function fireMapLoad() {
  const load = mapApi.on.mock.calls.find(([event]) => event === 'load')?.[1] as (() => void) | undefined;
  if (!load) throw new Error('map "load" handler was never registered');
  act(() => load());
}

/** Opens the filter panel and lets the initial auto-fit settle. */
async function openFiltersAfterInitialFit() {
  fireMapLoad();
  await waitFor(() => {
    expect(mapApi.fitBounds.mock.calls.length + mapApi.flyTo.mock.calls.length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getByTestId('map-filter-toggle'));
  mapApi.fitBounds.mockClear();
  mapApi.flyTo.mockClear();
}

beforeEach(() => {
  vi.clearAllMocks();
  mapApi.getZoom.mockReturnValue(4);
  try { sessionStorage.clear(); } catch { /* noop */ }
});

describe('AppointmentMapPage — Enter frames the search results', () => {
  it('fits every result on screen when several match', async () => {
    mockAppointments([
      appointment('a', -33.86, 151.2),
      appointment('b', -37.81, 144.96),
    ]);
    renderPage();
    await openFiltersAfterInitialFit();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'VST' } });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });

    await waitFor(() => {
      expect(mapApi.fitBounds).toHaveBeenCalledWith(
        [[144.96, -37.81], [151.2, -33.86]],
        expect.objectContaining({ maxZoom: 15, padding: 60 }),
      );
    });
  });

  it('centres a single result at zoom 14', async () => {
    mockAppointments([appointment('a', -33.86, 151.2)]);
    renderPage();
    await openFiltersAfterInitialFit();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'VST-a' } });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });

    await waitFor(() => {
      expect(mapApi.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [151.2, -33.86], zoom: 14 }),
      );
    });
    expect(mapApi.fitBounds).not.toHaveBeenCalled();
  });

  it('waits for the flushed search term to load before framing', async () => {
    // The debounce flush triggers a refetch. Framing the OLD pins would be the
    // bug — the camera must move only once the new result set has landed.
    let resolveSecond: ((value: unknown) => void) | undefined;
    let call = 0;
    mockGet.mockImplementation(async (path: string) => {
      if (path !== '/v1/appointments') {
        return { data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
      }
      call += 1;
      if (call === 1) {
        return {
          data: {
            data: [appointment('a', -33.86, 151.2), appointment('b', -37.81, 144.96)],
            pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
          },
        };
      }
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    });

    renderPage();
    await openFiltersAfterInitialFit();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'VST-b' } });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });

    // In flight: no camera move yet.
    await waitFor(() => expect(call).toBe(2));
    expect(mapApi.fitBounds).not.toHaveBeenCalled();
    expect(mapApi.flyTo).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecond?.({
        data: {
          data: [appointment('b', -37.81, 144.96)],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        },
      });
    });

    await waitFor(() => {
      expect(mapApi.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [144.96, -37.81], zoom: 14 }),
      );
    });
  });

  it('holds the camera still when nothing matched', async () => {
    mockAppointments([appointment('a', -33.86, 151.2)]);
    renderPage();
    await openFiltersAfterInitialFit();

    mockAppointments([]);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'nope' } });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/0 appointments/)).toBeInTheDocument();
    });
    expect(mapApi.fitBounds).not.toHaveBeenCalled();
    expect(mapApi.flyTo).not.toHaveBeenCalled();
  });
});
