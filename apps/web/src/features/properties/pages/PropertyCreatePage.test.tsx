import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { api } from '@/services/api';
import { PropertyCreatePage } from './PropertyCreatePage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

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
        <SnackbarProvider>
          <MemoryRouter initialEntries={['/properties/new']}>
            {children}
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <PropertyCreatePage />
    </Wrapper>,
  );
}

describe('PropertyCreatePage', () => {
  it('renders page title "New Property"', () => {
    renderPage();
    expect(screen.getByText('New Property')).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderPage();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders form sections', () => {
    renderPage();
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getAllByText('Notes').length).toBeGreaterThanOrEqual(1);
  });

  it('renders required form fields', () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Property Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Suburb')).toBeInTheDocument();
    expect(screen.getByLabelText('Postcode')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
  });

  it('renders Create Property button', () => {
    renderPage();
    expect(screen.getByText('Create Property')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    renderPage();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Create Property'));
    await waitFor(() => {
      const requiredErrors = screen.getAllByText('Required field');
      expect(requiredErrors.length).toBeGreaterThan(0);
    });
  });

  it('has centered form container', () => {
    const { container } = renderPage();
    const centeredDiv = container.querySelector('.mx-auto.max-w-\\[640px\\]');
    expect(centeredDiv).toBeInTheDocument();
  });
});
