import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'AM' }, isAuthenticated: true }),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/useApiQuery', () => ({
  useActionMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  usePaginatedQuery: () => ({
    data: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const mockRefetch = vi.fn();

vi.mock('../hooks/usePropertyDetail', () => ({
  usePropertyDetail: (id: string | null) => {
    if (!id) return { property: null, isLoading: false, isError: false, refetch: mockRefetch };
    if (id === 'loading') return { property: null, isLoading: true, isError: false, refetch: mockRefetch };
    if (id === 'error') return { property: null, isLoading: false, isError: true, refetch: mockRefetch };
    return {
      property: {
        id: 'prop-01', propertyCode: 'IMV-001', type: 'HOUSE', branchName: 'Filial Centro',
        tenantId: 'tenant-1', branchId: 'branch-1',
        street: 'Rua das Flores, 123', addressLine2: null, suburb: 'Centro', postcode: '01001-000', state: 'SP',
        country: 'BR', latitude: -23.5, longitude: -46.6, geocodingStatus: 'SUCCESS',
        notes: null, createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false, isError: false, refetch: mockRefetch,
    };
  },
}));

vi.mock('../hooks/usePropertyAppointments', () => ({
  usePropertyAppointments: () => ({
    data: [],
    isLoading: false,
    isError: false,
    errorMessage: null,
    refetch: vi.fn(),
    pagination: { page: 1, pageSize: 10, total: 0, onChange: vi.fn() },
  }),
}));

vi.mock('../components/PropertyFormDrawer', () => ({
  PropertyFormDrawer: () => null,
}));

vi.mock('../components/PropertyAppointmentsTab', () => ({
  PropertyAppointmentsTab: () => <div>appointments table</div>,
}));

import { PropertyDetailPage } from './PropertyDetailPage';

function createWrapper(initialEntry: string = '/properties/prop-01') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/properties/:id" element={children} />
              <Route path="/properties" element={<div>property list</div>} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function renderPage(initialEntry?: string) {
  const Wrapper = createWrapper(initialEntry);
  return render(<Wrapper><PropertyDetailPage /></Wrapper>);
}

describe('PropertyDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders property code in header', () => {
    renderPage();
    const matches = screen.getAllByText('IMV-001');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders property type chip', () => {
    renderPage();
    const matches = screen.getAllByText('House');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders tabs', () => {
    renderPage();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });

  it('shows overview content by default', () => {
    renderPage();
    expect(screen.getByText('Identification')).toBeInTheDocument();
  });

  it('switches to appointments tab on click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Appointments' }));
    expect(screen.getByText('appointments table')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderPage('/properties/loading');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    renderPage('/properties/error');
    expect(screen.getByText('Property not found')).toBeInTheDocument();
  });

  it('renders go back button', () => {
    renderPage();
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });

  it('renders edit button', () => {
    renderPage();
    expect(screen.getByLabelText('Edit property')).toBeInTheDocument();
  });
});
