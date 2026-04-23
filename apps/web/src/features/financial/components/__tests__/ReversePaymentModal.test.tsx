import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { ReversePaymentModal } from '../ReversePaymentModal';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

const INVOICE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

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

describe('ReversePaymentModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onSuccess.mockClear();
    mockPost.mockReset();
  });

  it('renders dialog title and Reason textarea when open', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ReversePaymentModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceId={INVOICE_ID} />
      </Wrapper>,
    );
    expect(screen.getByText('Reverse Payment')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  });

  it('shows warning about status change', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ReversePaymentModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceId={INVOICE_ID} />
      </Wrapper>,
    );
    expect(screen.getByText(/return the invoice to CLOSED status/i)).toBeInTheDocument();
  });

  it('shows validation error when reason is empty', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ReversePaymentModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceId={INVOICE_ID} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Confirm Reversal'));

    await waitFor(() => {
      expect(screen.getByText('Required field')).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls api.POST reverse-payment with reason and invoiceId', async () => {
    const Wrapper = createWrapper();
    mockPost.mockResolvedValueOnce({ data: { data: { id: INVOICE_ID, status: 'CLOSED' } }, error: undefined });

    render(
      <Wrapper>
        <ReversePaymentModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceId={INVOICE_ID} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Payment was made in error' },
    });
    fireEvent.click(screen.getByText('Confirm Reversal'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/billing/invoices/{invoiceId}/reverse-payment',
        expect.objectContaining({
          params: { path: { invoiceId: INVOICE_ID } },
          body: { reason: 'Payment was made in error' },
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps modal open on API error (does not call onClose or onSuccess)', async () => {
    const Wrapper = createWrapper();
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { status: 409, error: { code: 'INVOICE_NOT_PAID' } },
    });

    render(
      <Wrapper>
        <ReversePaymentModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceId={INVOICE_ID} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Reversal reason' },
    });
    fireEvent.click(screen.getByText('Confirm Reversal'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledOnce();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ReversePaymentModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceId={INVOICE_ID} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
