import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
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
    timeSlot: '09:00-12:00',
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

describe('AppointmentMapPage', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('Appointment Map')).toBeInTheDocument();
  });

  it('renders List View button', () => {
    renderPage();
    expect(screen.getByText('List View')).toBeInTheDocument();
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
});
