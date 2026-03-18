import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn().mockResolvedValue({ data: { data: {} } }),
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

import { FinancialBatchActions } from './FinancialBatchActions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('FinancialBatchActions', () => {
  const onClearSelection = vi.fn();
  const onApproveComplete = vi.fn();

  beforeEach(() => {
    onClearSelection.mockClear();
    onApproveComplete.mockClear();
  });

  it('renders nothing when no entries selected', () => {
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <FinancialBatchActions selectedIds={[]} onClearSelection={onClearSelection} onApproveComplete={onApproveComplete} />
      </Wrapper>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders batch actions bar when entries are selected', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FinancialBatchActions selectedIds={['id-1', 'id-2']} onClearSelection={onClearSelection} onApproveComplete={onApproveComplete} />
      </Wrapper>,
    );

    expect(screen.getByTestId('batch-actions-bar')).toBeInTheDocument();
    expect(screen.getByText('2 entries selected')).toBeInTheDocument();
    expect(screen.getByText('Approve Selected')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('shows singular text for single entry', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FinancialBatchActions selectedIds={['id-1']} onClearSelection={onClearSelection} onApproveComplete={onApproveComplete} />
      </Wrapper>,
    );

    expect(screen.getByText('1 entry selected')).toBeInTheDocument();
  });

  it('calls onClearSelection when Clear is clicked', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <FinancialBatchActions selectedIds={['id-1']} onClearSelection={onClearSelection} onApproveComplete={onApproveComplete} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(onClearSelection).toHaveBeenCalled();
  });
});
