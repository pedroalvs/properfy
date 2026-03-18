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

import { ServiceTypeFormDrawer } from './ServiceTypeFormDrawer';

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

describe('ServiceTypeFormDrawer', () => {
  it('renders create mode title when no serviceTypeId', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('New Service Type')).toBeInTheDocument();
  });

  it('renders form fields for code, name, flow type', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Flow Type')).toBeInTheDocument();
  });

  it('renders confirmation checkbox', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Requires tenant confirmation')).toBeInTheDocument();
  });

  it('renders Create Service Type button in create mode', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Service Type')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open={false} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-full');
  });
});
