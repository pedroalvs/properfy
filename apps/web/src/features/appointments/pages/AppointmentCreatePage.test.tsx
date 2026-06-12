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
import { AppointmentCreatePage } from './AppointmentCreatePage';

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
          <MemoryRouter initialEntries={['/appointments/new']}>
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
      <AppointmentCreatePage />
    </Wrapper>,
  );
}

describe('AppointmentCreatePage', () => {
  it('renders page title "New Appointment"', () => {
    renderPage();
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderPage();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders form sections', () => {
    renderPage();
    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    expect(screen.getByText('Tenant Contact')).toBeInTheDocument();
    expect(screen.getByText('Access & Key')).toBeInTheDocument();
    expect(screen.getByText('Restrictions')).toBeInTheDocument();
    expect(screen.getAllByText('Notes').length).toBeGreaterThanOrEqual(1);
  });

  it('renders required form fields', () => {
    renderPage();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Property')).toBeInTheDocument();
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Scheduled Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Time Slot')).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant Name')).toBeInTheDocument();
  });

  it('renders Create Appointment button', () => {
    renderPage();
    expect(screen.getByText('Create Appointment')).toBeInTheDocument();
  });

  it('renders contextual property creation action', () => {
    renderPage();
    expect(screen.getByText('Property not listed? Create one')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    renderPage();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Create Appointment'));
    await waitFor(() => {
      const requiredErrors = screen.getAllByText('Required field');
      expect(requiredErrors.length).toBeGreaterThan(0);
    });
  });

  it('opens the property-creation page in a new tab pre-filled with the selected agency and branch', async () => {
    mockGet.mockImplementation((path: string) => {
      const list = (items: Array<Record<string, unknown>>) => Promise.resolve({
        data: { data: items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: items.length ? 1 : 0 } },
      });
      if (path === '/v1/tenants') return list([{ id: 'tenant-1', name: 'Agency One' }]);
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    renderPage();

    // Select agency, then branch — the button is disabled until both are chosen.
    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));

    fireEvent.click(screen.getByText('Property not listed? Create one'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0]?.[0]);
    const target = openSpy.mock.calls[0]?.[1];
    expect(url).toContain('/properties/new?');
    expect(url).toContain('tenantId=tenant-1');
    expect(url).toContain('branchId=branch-9');
    expect(target).toBe('_blank');

    openSpy.mockRestore();
  });
});
