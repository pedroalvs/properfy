import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));
vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
    use: vi.fn(),
  },
}));
const mockFixedRule = {
  id: 'pr-1',
  tenantId: 't-1',
  currency: 'USD',
  serviceTypeId: 'st-1',
  branchId: 'b-1',
  priceAmount: 250,
  payoutType: 'FIXED' as const,
  payoutValue: 180,
  bonusRuleJson: null,
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockPercentageRule = {
  ...mockFixedRule,
  id: 'pr-2',
  payoutType: 'PERCENTAGE' as const,
  payoutValue: 70,
};

const mockUsePaginatedQuery = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  usePaginatedQuery: (...args: unknown[]) => mockUsePaginatedQuery(...args),
}));

import { PricingPreview } from './PricingPreview';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('PricingPreview', () => {
  it('renders nothing when branchId is empty', () => {
    mockUsePaginatedQuery.mockReturnValue({ data: null, isLoading: false, isError: false });
    const { container } = render(
      <PricingPreview branchId="" serviceTypeId="st-1" />,
      { wrapper: createWrapper() },
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when serviceTypeId is empty', () => {
    mockUsePaginatedQuery.mockReturnValue({ data: null, isLoading: false, isError: false });
    const { container } = render(
      <PricingPreview branchId="b-1" serviceTypeId="" />,
      { wrapper: createWrapper() },
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows loading skeleton while fetching', () => {
    mockUsePaginatedQuery.mockReturnValue({ data: null, isLoading: true, isError: false });
    render(<PricingPreview branchId="b-1" serviceTypeId="st-1" />, { wrapper: createWrapper() });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error message on fetch failure', () => {
    mockUsePaginatedQuery.mockReturnValue({ data: null, isLoading: false, isError: true });
    render(<PricingPreview branchId="b-1" serviceTypeId="st-1" />, { wrapper: createWrapper() });
    expect(screen.getByText('Failed to load pricing information')).toBeInTheDocument();
  });

  it('shows "no pricing rule" when no rule matches', () => {
    mockUsePaginatedQuery.mockReturnValue({
      data: { data: [], pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0 } },
      isLoading: false,
      isError: false,
    });
    render(<PricingPreview branchId="b-1" serviceTypeId="st-1" />, { wrapper: createWrapper() });
    expect(screen.getByText('No pricing rule found')).toBeInTheDocument();
  });

  it('displays fixed payout pricing correctly', () => {
    mockUsePaginatedQuery.mockReturnValue({
      data: { data: [mockFixedRule], pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 } },
      isLoading: false,
      isError: false,
    });
    render(<PricingPreview branchId="b-1" serviceTypeId="st-1" />, { wrapper: createWrapper() });

    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Base Price')).toBeInTheDocument();
    expect(screen.getByText('Inspector Payout')).toBeInTheDocument();
    expect(screen.getByText('Platform Fee')).toBeInTheDocument();

    // Base price / payout / fee: USD currency should be preserved
    expect(screen.getByTestId('base-price')).toHaveTextContent(/USD\s*250\.00/);
    expect(screen.getByTestId('inspector-payout')).toHaveTextContent(/USD\s*180\.00/);
    expect(screen.getByTestId('platform-fee')).toHaveTextContent(/USD\s*70\.00/);
  });

  it('displays percentage payout pricing correctly', () => {
    mockUsePaginatedQuery.mockReturnValue({
      data: { data: [mockPercentageRule], pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 } },
      isLoading: false,
      isError: false,
    });
    render(<PricingPreview branchId="b-1" serviceTypeId="st-1" />, { wrapper: createWrapper() });

    expect(screen.getByTestId('base-price')).toHaveTextContent(/USD\s*250\.00/);
    expect(screen.getByTestId('inspector-payout')).toHaveTextContent(/USD\s*175\.00/);
    // Shows percentage indicator
    expect(screen.getByText('(70%)')).toBeInTheDocument();
    expect(screen.getByTestId('platform-fee')).toHaveTextContent(/USD\s*75\.00/);
  });

  it('passes correct params to usePaginatedQuery', () => {
    mockUsePaginatedQuery.mockReturnValue({ data: null, isLoading: false, isError: false });
    render(<PricingPreview branchId="b-1" serviceTypeId="st-1" />, { wrapper: createWrapper() });

    expect(mockUsePaginatedQuery).toHaveBeenCalledWith(
      ['pricing-rules', 'preview', 'b-1', 'st-1'],
      '/v1/pricing-rules',
      { branchId: 'b-1', serviceTypeId: 'st-1', pageSize: 1 },
      { enabled: true },
    );
  });
});
