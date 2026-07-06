import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); this.name = 'ApiError'; }
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));

let mockUserRole = 'AM';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Test Admin', email: 'admin@test.com', role: mockUserRole, tenantId: null },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: 'token',
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { api } from '@/services/api';
import { AuditLogListPage } from './AuditLogListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_LOGS = [
  { id: 'log-01', tenantId: 'ten-1', actorType: 'USER', actorId: 'usr-1', entityType: 'APPOINTMENT', entityId: 'apt-01', action: 'STATUS_TRANSITION', reason: 'Released', beforeJson: null, afterJson: null, requestId: 'req-1', ipAddress: '127.0.0.1', metadataJson: null, createdAt: '2026-03-17T10:00:00Z' },
];

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>;
  };
}

beforeEach(() => {
  mockUserRole = 'AM';
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_LOGS, pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><AuditLogListPage /></Wrapper>);
}

describe('AuditLogListPage', () => {
  it('renders page title "Audit Logs"', () => {
    renderPage();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
  });

  it('renders filter bar', () => {
    renderPage();
    expect(screen.getByLabelText('Actor')).toBeInTheDocument();
    expect(screen.getByLabelText('Entity Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Entity ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Action')).toBeInTheDocument();
  });

  it('renders data table with audit log data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('APPOINTMENT')).toBeInTheDocument();
      expect(screen.getByText('Status Transition')).toBeInTheDocument();
    });
  });

  it('shows NoPermissionState for unauthorized roles (CL_USER)', () => {
    mockUserRole = 'CL_USER';
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view audit logs.")).toBeInTheDocument();
  });

  it('allows CL_ADMIN to view audit logs', () => {
    mockUserRole = 'CL_ADMIN';
    renderPage();
    expect(screen.queryByText("You don't have permission to view audit logs.")).not.toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
  });
});
