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
import { useAuth } from '@/hooks/useAuth';
import { CreateAdjustmentModal } from './CreateAdjustmentModal';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

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

describe('CreateAdjustmentModal', () => {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onCreated.mockClear();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { data: { id: 'new-adj' } } });
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: 'tenant-1', name: 'Acme Realty' },
          { id: 'tenant-2', name: 'Beta Homes' },
        ],
        pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      },
    });
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: { tenantId: 'tenant-1' } });
  });

  it('renders nothing when closed', () => {
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <CreateAdjustmentModal open={false} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateAdjustmentModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Adjustment')).toBeInTheDocument();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByLabelText('Effective Date')).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateAdjustmentModal open={true} onClose={onClose} onCreated={onCreated} />
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
        <CreateAdjustmentModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits using the authenticated tenant when the tenant field is locked', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateAdjustmentModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '125.50' } });
    fireEvent.change(screen.getByLabelText('Effective Date'), { target: { value: '2026-03-23' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Manual credit' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Pricing correction' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
  expect(mockPost).toHaveBeenCalledWith(
        '/v1/financial/entries/adjust',
        expect.objectContaining({
          body: expect.objectContaining({
            tenantId: 'tenant-1',
            amount: 125.5,
            description: 'Manual credit',
            reason: 'Pricing correction',
          }),
        }),
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('shows the resolved agency name in the locked select', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateAdjustmentModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    const agencyField = screen.getByLabelText('Agency');
    expect(agencyField).toBeDisabled();
    await waitFor(() => {
      expect(agencyField).toHaveTextContent('Acme Realty');
    });
  });

  it('lets a cross-agency operator pick an agency from the dropdown', async () => {
    mockUseAuth.mockReturnValue({ user: { tenantId: undefined } });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateAdjustmentModal open={true} onClose={onClose} onCreated={onCreated} />
      </Wrapper>,
    );

    const agencyField = screen.getByLabelText('Agency');
    expect(agencyField).not.toBeDisabled();

    fireEvent.click(agencyField);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Beta Homes' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: 'Beta Homes' }));

    expect(agencyField).toHaveTextContent('Beta Homes');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Effective Date'), { target: { value: '2026-03-23' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Cross-agency credit' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Support request' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/financial/entries/adjust',
        expect.objectContaining({
          body: expect.objectContaining({ tenantId: 'tenant-2' }),
        }),
      );
    });
  });
});
