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
import { MarkInvoicePaidModal } from '../MarkInvoicePaidModal';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

const INVOICE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const INVOICE_ID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

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

describe('MarkInvoicePaidModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onSuccess.mockClear();
    mockPost.mockReset();
  });

  it('renders single-invoice title when one invoiceId provided', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );
    expect(screen.getByText('Mark Invoice as Paid')).toBeInTheDocument();
  });

  it('renders batch title when multiple invoiceIds provided', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID, INVOICE_ID_2]} />
      </Wrapper>,
    );
    expect(screen.getByText('Mark 2 Invoices as Paid')).toBeInTheDocument();
    expect(screen.getByText(/you are about to mark 2 invoices as paid/i)).toBeInTheDocument();
  });

  it('shows Payment Date and Payment Reference fields', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Payment Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Payment Reference')).toBeInTheDocument();
  });

  it('shows validation error when Payment Date is cleared and form is submitted', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Payment Date'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Confirm Payment'));

    await waitFor(() => {
      expect(screen.getByText('Required field')).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls api.POST mark-paid with correct payload for single invoice', async () => {
    const Wrapper = createWrapper();
    mockPost.mockResolvedValueOnce({ data: { data: { id: INVOICE_ID, status: 'PAID' } }, error: undefined });

    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Payment Reference'), { target: { value: 'PAY-001' } });
    fireEvent.click(screen.getByText('Confirm Payment'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/billing/invoices/{invoiceId}/mark-paid',
        expect.objectContaining({
          params: { path: { invoiceId: INVOICE_ID } },
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls api.POST batch-mark-paid for multiple invoices', async () => {
    const Wrapper = createWrapper();
    mockPost.mockResolvedValueOnce({
      data: { data: { processed: [{ id: INVOICE_ID }, { id: INVOICE_ID_2 }], skipped: [] } },
      error: undefined,
    });

    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID, INVOICE_ID_2]} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Confirm Payment'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/billing/invoices/batch-mark-paid',
        expect.objectContaining({
          body: expect.objectContaining({ invoiceIds: [INVOICE_ID, INVOICE_ID_2] }),
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('keeps modal open on API error (does not call onClose or onSuccess)', async () => {
    const Wrapper = createWrapper();
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { status: 409, error: { code: 'INVOICE_ALREADY_PAID' } },
    });

    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Confirm Payment'));

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
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('opens the native picker when the payment date input is clicked', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MarkInvoicePaidModal open={true} onClose={onClose} onSuccess={onSuccess} invoiceIds={[INVOICE_ID]} />
      </Wrapper>,
    );
    const input = screen.getByLabelText('Payment Date') as HTMLInputElement;
    const showPickerSpy = vi.fn();
    (input as any).showPicker = showPickerSpy;
    fireEvent.click(input);
    expect(showPickerSpy).toHaveBeenCalledTimes(1);
  });
});
