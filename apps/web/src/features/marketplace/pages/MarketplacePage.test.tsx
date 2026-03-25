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
    groupId: 'grp-01',
    tenantName: 'Sydney CBD',
    serviceTypeName: 'Routine Inspection',
    priorityMode: 'STANDARD',
    groupSize: 3,
    scheduledDate: '2026-03-20',
    timeWindow: '09:00-12:00',
    priorityExpiresAt: '2026-04-01T00:00:00Z',
    suburbs: ['Sydney CBD'],
  },
  {
    groupId: 'grp-02',
    tenantName: 'Melbourne Inner',
    serviceTypeName: 'Routine Inspection',
    priorityMode: 'PRIORITY_24H',
    groupSize: 1,
    scheduledDate: '2026-03-21',
    timeWindow: '13:00-16:00',
    priorityExpiresAt: '2026-03-20T00:00:00Z',
    suburbs: [],
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

  it('renders neutral map information panel', () => {
    renderPage();
    expect(screen.getByTestId('marketplace-map-panel')).toBeInTheDocument();
  });

  it('renders map screen layout', () => {
    renderPage();
    expect(screen.getByTestId('map-screen-layout')).toBeInTheDocument();
  });

  it('renders offer list after data loads', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Sydney CBD').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Melbourne Inner').length).toBeGreaterThan(0);
  });

  it('does not render unsupported filters', () => {
    renderPage();
    expect(screen.queryByTestId('offer-filters')).not.toBeInTheDocument();
  });

  it('shows placeholder text when no offer is selected', () => {
    renderPage();
    expect(screen.getByText('Select an offer to view its summary.')).toBeInTheDocument();
  });
});
