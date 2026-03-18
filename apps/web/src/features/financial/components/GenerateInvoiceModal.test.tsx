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
import { GenerateInvoiceModal } from './GenerateInvoiceModal';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

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

describe('GenerateInvoiceModal', () => {
  const onClose = vi.fn();
  const onGenerated = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onGenerated.mockClear();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { data: { id: 'inv-new' } } });
  });

  it('renders nothing when closed', () => {
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <GenerateInvoiceModal open={false} onClose={onClose} onGenerated={onGenerated} />
      </Wrapper>,
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <GenerateInvoiceModal open={true} onClose={onClose} onGenerated={onGenerated} />
      </Wrapper>,
    );
    expect(screen.getByText('Generate Invoice')).toBeInTheDocument();
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Period Start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period End')).toBeInTheDocument();
    expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <GenerateInvoiceModal open={true} onClose={onClose} onGenerated={onGenerated} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getAllByText('Required field').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('validates end date is after start date', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <GenerateInvoiceModal open={true} onClose={onClose} onGenerated={onGenerated} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Inspector'), { target: { value: 'insp-01' } });
    fireEvent.change(screen.getByLabelText('Period Start'), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText('Period End'), { target: { value: '2026-03-01' } });

    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByText('End date must be after start date')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <GenerateInvoiceModal open={true} onClose={onClose} onGenerated={onGenerated} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
