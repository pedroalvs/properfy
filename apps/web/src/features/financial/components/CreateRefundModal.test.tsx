import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';

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
        <CreateRefundModal open={false} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Refund')).toBeInTheDocument();
    expect(screen.getByLabelText('Financial Entry ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getAllByText('Required field').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a description error separately from the reason field', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Financial Entry ID'), { target: { value: '123e4567-e89b-12d3-a456-426614174000' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer overpaid' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Required')).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows an error when financial entry ID is not a UUID', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Financial Entry ID'), { target: { value: 'entry-1' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Refund requested' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer overpaid' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Invalid entry ID')).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
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
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Financial Entry ID'), { target: { value: '123e4567-e89b-12d3-a456-426614174000' } });
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
        <CreateRefundModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Financial Entry ID'), { target: { value: '123e4567-e89b-12d3-a456-426614174000' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Refund requested' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Customer overpaid' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create refund')).toBeInTheDocument();
    });
    expect(screen.queryByText('ECONNREFUSED at pg-pool')).not.toBeInTheDocument();
  });
});
