import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders filter panel with mode selector', () => {
    renderPage();
    expect(screen.getByTestId('map-filter-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
  });

  it('renders status multi-select in filter panel', () => {
    renderPage();
    expect(screen.getByText('Status')).toBeInTheDocument();
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
