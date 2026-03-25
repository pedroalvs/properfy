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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'CL_ADMIN', tenantId: 'tenant-1' },
  }),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({
    options: [{ value: '123e4567-e89b-12d3-a456-426614174000', label: 'Diego' }],
    isLoading: false,
  }),
}));

import { GenerateInvoiceModal } from './GenerateInvoiceModal';

import { api } from '@/services/api';
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

    fireEvent.click(screen.getByLabelText('Inspector'));
    fireEvent.click(screen.getByText('Diego'));
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

  it('submits period dates in YYYY-MM-DD format', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <GenerateInvoiceModal open={true} onClose={onClose} onGenerated={onGenerated} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByLabelText('Inspector'));
    fireEvent.click(screen.getByText('Diego'));
    fireEvent.change(screen.getByLabelText('Period Start'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Period End'), { target: { value: '2026-03-31' } });

    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/v1/billing/invoices/generate', {
        body: {
          inspectorId: '123e4567-e89b-12d3-a456-426614174000',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
          periodType: 'MONTHLY',
        },
      });
    });
  });
});
