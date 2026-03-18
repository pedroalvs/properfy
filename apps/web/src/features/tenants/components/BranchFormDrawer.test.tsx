import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

import { BranchFormDrawer } from './BranchFormDrawer';

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

describe('BranchFormDrawer', () => {
  it('renders create mode title when no branch', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('New Branch')).toBeInTheDocument();
  });

  it('renders form fields for name, address, contact email', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact Email')).toBeInTheDocument();
  });

  it('renders Create Branch button in create mode', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Branch')).toBeInTheDocument();
  });

  it('renders edit mode title when branch is provided', () => {
    const Wrapper = createWrapper();
    const branch = {
      id: 'br-01',
      tenantId: 'ten-01',
      name: 'Centro',
      address: 'Rua Augusta, 100',
      contactEmail: 'centro@imob.com',
      status: 'ACTIVE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" branch={branch} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Edit Branch')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open={false} onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-full');
  });
});
