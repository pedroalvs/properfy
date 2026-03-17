import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { InspectorListPage } from './InspectorListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INSPECTORS = [
  { id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', status: 'ACTIVE', phone: '11999999999' },
  { id: 'insp-02', name: 'Fernanda Lima', email: 'fernanda@inspecoes.com', status: 'INACTIVE', phone: '11888888888' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>{children}</SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_INSPECTORS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><InspectorListPage /></Wrapper>);
}

describe('InspectorListPage', () => {
  it('renders page title "Inspetores"', () => {
    renderPage();
    expect(screen.getByText('Inspectors')).toBeInTheDocument();
  });

  it('renders "New Inspector" CTA button', () => {
    renderPage();
    const buttons = screen.getAllByText('New Inspector');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with inspector data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    const nameElements = screen.getAllByText('Name');
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
  });
});
