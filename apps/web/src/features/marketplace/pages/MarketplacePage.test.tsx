import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { MarketplacePage } from './MarketplacePage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_OFFERS = [
  {
    id: 'off-01',
    groupId: 'grp-01',
    groupName: 'Sydney CBD',
    regionName: 'NSW',
    priorityMode: 'STANDARD',
    appointmentsCount: 3,
    totalPayout: 450,
    expiresAt: '2026-04-01T00:00:00Z',
    createdAt: '2026-03-15T00:00:00Z',
    appointments: [
      { id: 'apt-01', code: 'APT-001', address: '123 George St', scheduledDate: '2026-03-20', timeSlot: '09:00-12:00', latitude: -33.8688, longitude: 151.2093 },
    ],
  },
  {
    id: 'off-02',
    groupId: 'grp-02',
    groupName: 'Melbourne Inner',
    regionName: 'VIC',
    priorityMode: 'PRIORITY_24H',
    appointmentsCount: 1,
    totalPayout: 200,
    expiresAt: '2026-03-20T00:00:00Z',
    createdAt: '2026-03-16T00:00:00Z',
    appointments: [],
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
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
      data: MOCK_OFFERS,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><MarketplacePage /></Wrapper>);
}

describe('MarketplacePage', () => {
  it('renders page title "Marketplace"', () => {
    renderPage();
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('renders map container', () => {
    renderPage();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders map screen layout', () => {
    renderPage();
    expect(screen.getByTestId('map-screen-layout')).toBeInTheDocument();
  });

  it('renders offer list after data loads', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Sydney CBD')).toBeInTheDocument();
    });

    expect(screen.getByText('Melbourne Inner')).toBeInTheDocument();
  });

  it('renders filters', () => {
    renderPage();
    expect(screen.getByTestId('offer-filters')).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
  });

  it('shows placeholder text when no offer is selected', () => {
    renderPage();
    expect(screen.getByText('Select an offer to view appointments')).toBeInTheDocument();
  });
});
