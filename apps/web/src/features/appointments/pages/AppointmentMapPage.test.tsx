import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

// Role is injected synchronously so the page's initial-mode useState sees it
// at mount (mirrors the real app, where the map renders behind the auth guard
// with the user already loaded). Default AM keeps the role-agnostic tests on
// the AM/OP happy path; per-test overrides set authState.role.
const authState = vi.hoisted(() => ({ role: 'AM' as string | null }));

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: authState.role
      ? {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          role: authState.role,
          tenantId: authState.role.startsWith('CL') ? 'tenant-1' : null,
        }
      : null,
    token: authState.role ? 'test-token' : null,
    isAuthenticated: authState.role != null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { api } from '@/services/api';
import { AppointmentMapPage } from './AppointmentMapPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_MAP_DATA = [
  {
    id: 'apt-1',
    code: 'VST-001',
    status: 'SCHEDULED',
    address: '123 Main St, Sydney',
    latitude: -33.8688,
    longitude: 151.2093,
    scheduledDate: '2026-04-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    inspectorName: 'John Smith',
    branchName: 'Central',
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter>{children}</MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  authState.role = 'AM';
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_MAP_DATA,
      pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
    },
  });
  // 026 cycle-1 — filter panel state persists via sessionStorage; reset
  // it between tests so each starts from the canonical "closed" default.
  try { sessionStorage.clear(); } catch { /* noop in non-jsdom envs */ }
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <AppointmentMapPage />
    </Wrapper>,
  );
}

// Renders the page at a specific URL so we can exercise the ?mode= deep-link.
function renderPageAt(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SnackbarProvider>
          <MemoryRouter initialEntries={initialEntries}>
            <AppointmentMapPage />
          </MemoryRouter>
        </SnackbarProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AppointmentMapPage', () => {
  it('renders map screen layout in fullscreen mode (no page title)', () => {
    // 026 F3: PageHeader removed — map is now fullscreen with no title.
    renderPage();
    expect(screen.queryByText('Appointment Map')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-screen-layout')).toBeInTheDocument();
  });

  it('renders map container', () => {
    renderPage();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders map screen layout', () => {
    renderPage();
    expect(screen.getByTestId('map-screen-layout')).toBeInTheDocument();
  });

  // 026 cycle-1 — filter panel is CLOSED by default; only the toggle
  // button is visible. The previous assertions presumed the panel was
  // open on first render and broke when the user smoke caught that the
  // panel was leaking through the slide-out animation.
  it('renders the top-left Filters toggle button (panel CLOSED by default)', () => {
    renderPage();
    expect(screen.getByTestId('map-filter-toggle')).toBeInTheDocument();
  });

  it('side panel is REMOVED from DOM when filters are closed', () => {
    renderPage();
    expect(screen.queryByTestId('map-side-panel')).toBeNull();
    expect(screen.queryByTestId('map-filter-panel')).toBeNull();
  });

  it('clicking the toggle opens the filter panel + its scroll wrapper', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    expect(screen.getByTestId('map-side-panel')).toBeInTheDocument();
    expect(screen.getByTestId('map-filter-panel')).toBeInTheDocument();
    // 026 cycle-1 devolução Issue 2 — the filter region wraps in a
    // `flex-1 min-h-0 overflow-y-auto` so the inputs scroll when the
    // collapsed accordion sections expand past the viewport.
    const scroll = screen.getByTestId('map-side-panel-scroll');
    expect(scroll.className).toContain('overflow-y-auto');
    expect(scroll.className).toContain('min-h-0');
  });

  // 026 cycle-1 devolução — the external top-left toggle button must
  // HIDE when the panel is open; otherwise it overlays the panel
  // header text. The panel's own close `×` is the canonical affordance
  // while open.
  it('top-left toggle button is hidden while the filter panel is open', () => {
    renderPage();
    expect(screen.getByTestId('map-filter-toggle')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    expect(screen.queryByTestId('map-filter-toggle')).toBeNull();
  });

  it('side panel does NOT render the appointment/group list (Issue 3 removed)', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    const panelContent = screen.getByTestId('map-side-panel-content');
    // Pre-fix, the panel rendered the lasso-style list of appointments
    // immediately below the filters. The fix removes that list; the only
    // remaining direct child after the header is the filter wrapper.
    // Asserting NO `<button class="w-full border-b...">` rows is the
    // tightest regression guard for the list removal.
    const listButtons = panelContent.querySelectorAll('button.w-full.border-b');
    expect(listButtons.length).toBe(0);
  });

  // 025 round-2 regression — the map wrapper carries a cursor class that
  // flips while a lasso is being drawn so the crosshair is consistent.
  // Default state must NOT carry the drawing class.
  it('map wrapper has no lasso-drawing class by default', () => {
    renderPage();
    const wrapper = screen.getByTestId('appointment-map-wrapper');
    expect(wrapper.className).not.toContain('appt-map-lasso-drawing');
  });

  // The Service Groups list "Map View" button deep-links to /map?mode=groups.
  // The mode is seeded from the URL once on mount (AM/OP only — see FIX 3).
  it('starts in groups mode when opened at /map?mode=groups (AM)', () => {
    authState.role = 'AM';
    renderPageAt(['/map?mode=groups']);
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    expect(screen.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Appointments' })).toHaveAttribute('aria-selected', 'false');
  });

  // FIX 3 — Groups is an AM/OP-only surface. A client role landing on the
  // groups deep-link must NOT enter groups mode; it stays on appointments and
  // never sees the (hidden) Groups toggle — no 403 dead-end.
  it('client role stays in appointments mode at /map?mode=groups', () => {
    authState.role = 'CL_USER';
    renderPageAt(['/map?mode=groups']);
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    expect(screen.getByRole('tab', { name: 'Appointments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Groups' })).toBeNull();
  });

  it('does not fetch /v1/service-groups for a client role', async () => {
    authState.role = 'CL_USER';
    mockGet.mockResolvedValue({
      data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
    });
    renderPage();
    // Wait until the appointments query has fired so all mount-time queries
    // have had their chance to run.
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/appointments', expect.anything());
    });
    expect(mockGet).not.toHaveBeenCalledWith('/v1/service-groups', expect.anything());
  });

  it('starts in appointments mode when opened at /map with no mode param', () => {
    renderPageAt(['/map']);
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    expect(screen.getByRole('tab', { name: 'Appointments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'false');
  });

  // The time-slot catalog is gone: the "Time" filter is now a free from/to
  // range that maps to the /v1/appointments timeFrom/timeTo query params. The
  // map must NOT fetch any time-slot catalog endpoint.
  it('does not fetch any time-slot catalog endpoint', async () => {
    mockGet.mockResolvedValue({
      data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
    });
    renderPage();
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/appointments', expect.anything());
    });
    expect(mockGet).not.toHaveBeenCalledWith('/v1/time-slots', expect.anything());
    expect(mockGet).not.toHaveBeenCalledWith('/v1/appointment-time-slots', expect.anything());
  });

  it('sends timeFrom/timeTo to /v1/appointments when the Time filter is set', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('map-filter-toggle'));
    fireEvent.change(screen.getByLabelText('Time - start'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Time - end'), { target: { value: '12:00' } });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/appointments',
        expect.objectContaining({
          params: { query: expect.objectContaining({ timeFrom: '09:00', timeTo: '12:00' }) },
        }),
      );
    });
  });
});

// Item 13 — the map must aggregate ALL pages, not silently truncate at the
// backend's 100-row page cap.
describe('AppointmentMapPage — full pagination fetch', () => {
  it('aggregates every page of /v1/appointments before rendering the count', async () => {
    const pageOneItems = Array.from({ length: 100 }, (_, i) => ({
      ...MOCK_MAP_DATA[0],
      id: `apt-${i}`,
      code: `VST-${i}`,
    }));
    const pageTwoItems = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_MAP_DATA[0],
      id: `apt-1${i}`,
      code: `VST-1${i}`,
    }));
    mockGet.mockImplementation(async (path: string, opts: { params?: { query?: Record<string, string> } }) => {
      if (path !== '/v1/appointments') {
        return { data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
      }
      const page = Number(opts?.params?.query?.page ?? '1');
      return {
        data: {
          data: page === 1 ? pageOneItems : pageTwoItems,
          pagination: { page, pageSize: 100, total: 105, totalPages: 2 },
        },
      };
    });

    renderPage();
    fireEvent.click(screen.getByTestId('map-filter-toggle'));

    await waitFor(() => {
      expect(screen.getByText(/105 appointments/)).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/v1/appointments',
      expect.objectContaining({ params: { query: expect.objectContaining({ page: '1', pageSize: '100' }) } }),
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/v1/appointments',
      expect.objectContaining({ params: { query: expect.objectContaining({ page: '2', pageSize: '100' }) } }),
    );
  });
});
