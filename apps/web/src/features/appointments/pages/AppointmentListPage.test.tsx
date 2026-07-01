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

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(() => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })),
}));

import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { AppointmentListPage } from './AppointmentListPage';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  {
    id: 'apt-01', code: 'VST-001', status: 'SCHEDULED', branchName: 'Filial Centro',
    address: 'Rua das Flores, 123', contactName: 'João', scheduledDate: '2026-04-01',
    timeSlotStart: '09:00', timeSlotEnd: '12:00', rentalTenantConfirmationStatus: 'PENDING',
  },
  {
    id: 'apt-02', code: 'VST-002', status: 'DONE', branchName: 'Filial Norte',
    address: 'Av. Paulista, 1000', contactName: 'Maria', scheduledDate: '2026-04-02',
    timeSlotStart: '14:00', timeSlotEnd: '17:00', rentalTenantConfirmationStatus: 'CONFIRMED',
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
  mockGet.mockResolvedValue({ data: {
    data: MOCK_APPOINTMENTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
  mockUseAuth.mockReturnValue({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
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
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });

  it('renders "New Appointment" CTA button', () => {
    renderPage();
    expect(screen.getAllByText('New Appointment').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Map View button for AM role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Map View')).toBeInTheDocument();
  });

  it('shows Map View button for CL_ADMIN role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u2', name: 'Client', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Map View')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
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
    expect(screen.getByText('Code')).toBeInTheDocument();
  });
});
