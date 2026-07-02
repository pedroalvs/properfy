import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: () => 't', hasTokens: () => true, setTokens: vi.fn(), clearTokens: vi.fn() },
}));

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({
  api: { GET: (...a: unknown[]) => mockGet(...a), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

let mockUser: { id: string; name: string; email: string; role: string; tenantId: string | null; clUserPermissions?: string[] } | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockUser !== null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: mockUser ? 'token' : null,
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { SnackbarProvider } from '@/hooks/useSnackbar';
import { AgencyFinancialPage } from './AgencyFinancialPage';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SnackbarProvider>{children}</SnackbarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage() {
  return render(<AgencyFinancialPage />, { wrapper });
}

beforeEach(() => {
  mockUser = null;
  mockGet.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (String(path).includes('/summary')) {
      return Promise.resolve({ data: { data: { totalDebits: 0, totalPayouts: 0, totalAdjustments: 0, totalRefunds: 0, pendingCount: 0, currency: 'AUD' } } });
    }
    return Promise.resolve({ data: { data: [], pagination: { total: 0, page: 1, pageSize: 10 } } });
  });
});

describe('AgencyFinancialPage', () => {
  it('renders the read-only surface for CL_ADMIN (tabs + export, no backoffice actions)', async () => {
    mockUser = { id: 'u1', name: 'Admin', email: 'a@t.com', role: 'CL_ADMIN', tenantId: 'tenant-1' };
    renderPage();

    expect(await screen.findByText('Statement')).toBeInTheDocument();
    expect(screen.getByText('Services rendered')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /export/i }).length).toBeGreaterThan(0);
    // No backoffice actions on the agency surface.
    expect(screen.queryByRole('button', { name: /adjustment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('batch-actions-bar')).not.toBeInTheDocument();
  });

  it('renders for a CL_USER holding the view_financials flag', async () => {
    mockUser = { id: 'u2', name: 'User', email: 'u@t.com', role: 'CL_USER', tenantId: 'tenant-1', clUserPermissions: ['view_financials'] };
    renderPage();

    expect(await screen.findByText('Statement')).toBeInTheDocument();
    expect(screen.queryByText(/don't have permission/i)).not.toBeInTheDocument();
  });

  it('shows NoPermissionState for a CL_USER without the view_financials flag', async () => {
    mockUser = { id: 'u3', name: 'User', email: 'u@t.com', role: 'CL_USER', tenantId: 'tenant-1', clUserPermissions: [] };
    renderPage();

    expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument();
    expect(screen.queryByText('Services rendered')).not.toBeInTheDocument();
  });
});
