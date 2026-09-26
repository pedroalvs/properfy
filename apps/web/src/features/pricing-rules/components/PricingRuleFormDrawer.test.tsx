import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PricingRule } from '../types';
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

import { PricingRuleFormDrawer } from './PricingRuleFormDrawer';

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
  vi.clearAllMocks();
});

describe('PricingRuleFormDrawer', () => {
  it('renders create mode title when no rule', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PricingRuleFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('New Pricing Rule')).toBeInTheDocument();
  });

  it('renders form fields', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PricingRuleFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Price Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Payout Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Payout Value')).toBeInTheDocument();
  });

  it('renders Create Pricing Rule button in create mode', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PricingRuleFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Pricing Rule')).toBeInTheDocument();
  });

  it('prefills and locks the agency when defaultTenantId is provided', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PricingRuleFormDrawer
          open
          onClose={vi.fn()}
          onSaved={vi.fn()}
          defaultTenantId="ten-1"
          tenantOptions={[{ value: 'ten-1', label: 'Imob Alpha' }]}
        />
      </Wrapper>,
    );

    expect(screen.getByLabelText('Agency')).toBeDisabled();
  });

  it('renders Cancel button', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PricingRuleFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PricingRuleFormDrawer open={false} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-full');
  });

  it('rehydrates from persisted values when the same rule is reopened, discarding abandoned edits (#610)', () => {
    const RULE_A: PricingRule = {
      id: 'pr-1', tenantId: 'ten-1', tenantName: 'Alpha', currency: 'AUD',
      serviceTypeId: 'st-1', serviceTypeName: 'Routine', branchId: null,
      priceAmount: 150, payoutType: 'FIXED', payoutValue: 100, bonusRuleJson: null,
      status: 'ACTIVE', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
    };
    const Wrapper = createWrapper();
    const { rerender } = render(
      <Wrapper>
        <PricingRuleFormDrawer open rule={RULE_A} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    expect(screen.getByLabelText('Price Amount')).toHaveValue('150');

    // Abandon an edit, then close (drawer keeps its children mounted).
    fireEvent.change(screen.getByLabelText('Price Amount'), { target: { value: '999' } });
    expect(screen.getByLabelText('Price Amount')).toHaveValue('999');
    rerender(
      <Wrapper>
        <PricingRuleFormDrawer open={false} rule={RULE_A} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    // Reopen the same rule → the field is back to the persisted value, not 999.
    rerender(
      <Wrapper>
        <PricingRuleFormDrawer open rule={RULE_A} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Price Amount')).toHaveValue('150');
  });
});
