import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { ServiceGroupMapPage } from './ServiceGroupMapPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_GROUPS = [
  {
    id: 'sg-1',
    name: 'Sydney East',
    regionName: 'Eastern Suburbs',
    status: 'PUBLISHED',
    priorityMode: 'STANDARD',
    appointmentsCount: 2,
    appointments: [
      {
        id: 'apt-1',
        code: 'VST-001',
        status: 'SCHEDULED',
        address: '123 Main St',
        latitude: -33.8,
        longitude: 151.2,
        scheduledDate: '2026-05-01',
        inspectorName: 'John Smith',
      },
    ],
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
      data: MOCK_GROUPS,
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <ServiceGroupMapPage />
    </Wrapper>,
  );
}

describe('ServiceGroupMapPage', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('Service Group Map')).toBeInTheDocument();
  });

  it('renders List View button', () => {
    renderPage();
    expect(screen.getByText('List View')).toBeInTheDocument();
  });

  it('renders map container', () => {
    renderPage();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders service group list in side panel', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Sydney East')).toBeInTheDocument();
    });
  });

  it('renders status filter', () => {
    renderPage();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  // Regression: date filters must be present (parity with AppointmentMapPage).
  it('renders From Date and To Date filters', () => {
    renderPage();
    expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    expect(screen.getByLabelText('To Date')).toBeInTheDocument();
  });

  it('renders Search filter', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  // Regression: "select first" overlay must NOT exist — all pins visible without group selection.
  it('does not show "select a service group" instruction when no group is selected', () => {
    renderPage();
    expect(
      screen.queryByText('Select a service group to view appointments on map'),
    ).not.toBeInTheDocument();
  });

  it('shows empty state in side panel when no groups returned', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [],
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No service groups found')).toBeInTheDocument();
    });
  });
});
