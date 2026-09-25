import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';
import { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import type { FinancialEntry } from '../types';

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
import { CreateRefundModal } from './CreateRefundModal';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          {children}
          <Snackbar />
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

const MOCK_ENTRY: FinancialEntry = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  tenantId: 'tenant-1',
  appointmentCode: 'VIST-001',
  entryType: FinancialEntryType.TENANT_DEBIT,
  amount: 350,
  currency: 'AUD',
  status: FinancialEntryStatus.APPROVED,
  description: 'Inspection debit',
  relatedEntityName: 'Imobiliária Centro',
  effectiveAt: '2026-03-10T14:00:00Z',
  approvedByName: 'Admin Principal',
  createdAt: '2026-03-10T10:00:00Z',
  updatedAt: '2026-03-10T10:00:00Z',
};

describe('CreateRefundModal', () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onCreated.mockClear();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { data: { id: 'new-refund' } } });
  });

  it('renders nothing when closed', () => {
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <CreateRefundModal open={false} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders the selected entry read-only, with no free-text ID field', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Refund')).toBeInTheDocument();
    expect(screen.queryByLabelText('Financial Entry ID')).not.toBeInTheDocument();
    expect(screen.getByText('Agency Debit')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    // The raw entry id must never be exposed as text or as an input value.
    expect(screen.queryByText(MOCK_ENTRY.id)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(MOCK_ENTRY.id)).not.toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits a refund against the entry id from the selected entry', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Refund requested' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer overpaid' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        `/v1/financial/entries/${MOCK_ENTRY.id}/refund`,
        expect.objectContaining({
          body: { description: 'Refund requested', reason: 'Customer overpaid' },
        }),
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('surfaces the backend error message in the snackbar on failure', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'FINANCIAL_ENTRY_NOT_REFUNDABLE', message: 'Entry was already refunded' } },
      response: { status: 409 },
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Refund requested' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer overpaid' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Entry was already refunded')).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('falls back to the generic message on a 500', async () => {
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'INTERNAL_ERROR', message: 'ECONNREFUSED at pg-pool' } },
      response: { status: 500 },
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} entry={MOCK_ENTRY} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Refund requested' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer overpaid' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create refund')).toBeInTheDocument();
    });
    expect(screen.queryByText('ECONNREFUSED at pg-pool')).not.toBeInTheDocument();
  });
});
