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
import { PricingRuleListPage } from './PricingRuleListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_RULES = [
  { id: 'pr-01', tenantId: 'ten-1', tenantName: 'Imob Alpha', serviceTypeId: 'st-1', serviceTypeName: 'Routine', branchId: null, branchName: null, priceAmount: 150, payoutType: 'FIXED', payoutValue: 100, bonusRuleJson: null, status: 'ACTIVE', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
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
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/tenants') {
      return Promise.resolve({ data: {
        data: [{ id: 'ten-1', name: 'Imob Alpha' }],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      } });
    }
    if (path === '/v1/service-types') {
      return Promise.resolve({ data: {
        data: [{ id: 'st-1', name: 'Routine' }],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      } });
    }
    return Promise.resolve({ data: {
      data: MOCK_RULES,
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    } });
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><PricingRuleListPage /></Wrapper>);
}

describe('PricingRuleListPage', () => {
  it('renders page title "Pricing Rules"', () => {
    renderPage();
    expect(screen.getByText('Pricing Rules')).toBeInTheDocument();
  });

  it('renders "New Pricing Rule" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New Pricing Rule');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with agency, service type, branch, and status', () => {
    renderPage();
    expect(screen.getAllByLabelText('Agency').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('Service Type').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('Branch').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('Status').length).toBeGreaterThanOrEqual(1);
  });

  it('renders data table with pricing rule data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Imob Alpha')).toBeInTheDocument();
    });
  });
});
