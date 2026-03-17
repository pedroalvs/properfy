import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
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

import { apiClient } from '@/lib/api-client';
import { AppointmentListPage } from './AppointmentListPage';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  {
    id: 'apt-01', code: 'VST-001', status: 'SCHEDULED', branchName: 'Filial Centro',
    address: 'Rua das Flores, 123', contactName: 'João', scheduledDate: '2026-04-01',
    timeSlot: '09:00-12:00',
  },
  {
    id: 'apt-02', code: 'VST-002', status: 'DONE', branchName: 'Filial Norte',
    address: 'Av. Paulista, 1000', contactName: 'Maria', scheduledDate: '2026-04-02',
    timeSlot: '14:00-17:00',
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
            {children}
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: MOCK_APPOINTMENTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <AppointmentListPage />
    </Wrapper>,
  );
}

describe('AppointmentListPage', () => {
  it('renders page title "Vistorias"', () => {
    renderPage();
    expect(screen.getByText('Vistorias')).toBeInTheDocument();
  });

  it('renders "Nova Vistoria" CTA button', () => {
    renderPage();
    expect(screen.getAllByText('Nova Vistoria').length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with appointment data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('VST-001')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Código')).toBeInTheDocument();
  });
});
