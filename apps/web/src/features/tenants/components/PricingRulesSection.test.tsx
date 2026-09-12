import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { api } from '@/services/api';
import { PricingRulesSection } from './PricingRulesSection';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

// A rule whose service-type and branch ids are NOT present in the (capped)
// options responses below. Before #674 the section resolved names from those
// option lists, so this row rendered blank/raw ids. Now the names travel on
// the row itself, joined server-side.
const RULE = {
  id: 'pr-1',
  tenantId: 'ten-01',
  currency: 'AUD',
  serviceTypeId: 'st-999',
  serviceTypeName: 'Premium Inspection',
  branchId: 'br-999',
  branchName: 'Faraway Branch',
  priceAmount: 150,
  payoutType: 'FIXED',
  payoutValue: 100,
  bonusRuleJson: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function paginated<T>(rows: T[]) {
  return {
    data: { data: rows, pagination: { page: 1, pageSize: 100, total: rows.length, totalPages: 1 } },
    error: undefined,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/pricing-rules') return Promise.resolve(paginated([RULE]));
    // Options are capped and deliberately do NOT contain st-999 / br-999.
    if (path === '/v1/service-types') return Promise.resolve(paginated([{ id: 'st-1', name: 'Other Type' }]));
    if (path === '/v1/branches') return Promise.resolve(paginated([{ id: 'br-1', name: 'Other Branch' }]));
    return Promise.resolve(paginated([]));
  });
});

describe('PricingRulesSection', () => {
  it('renders service-type and branch names from the rule row, not the capped options (#674)', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><PricingRulesSection tenantId="ten-01" tenantName="Imob Alpha" /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Premium Inspection')).toBeInTheDocument();
    });
    expect(screen.getByText('Faraway Branch')).toBeInTheDocument();
    // The raw ids must never leak into the table.
    expect(screen.queryByText('st-999')).not.toBeInTheDocument();
    expect(screen.queryByText('br-999')).not.toBeInTheDocument();
  });
});
