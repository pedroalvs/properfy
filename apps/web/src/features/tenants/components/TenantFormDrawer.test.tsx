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

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(() => ({ role: 'AM', hasRole: () => true, canPerform: () => true })),
}));

import { usePermissions } from '@/hooks/usePermissions';
import { TenantFormDrawer } from './TenantFormDrawer';

const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

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
  mockUsePermissions.mockReturnValue({ role: 'AM', hasRole: () => true, canPerform: () => true });
});

describe('TenantFormDrawer', () => {
  it('shows the email toggle for AM', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Send automated emails')).toBeInTheDocument();
  });

  it('hides the email toggle for non-AM roles (OP)', () => {
    mockUsePermissions.mockReturnValue({
      role: 'OP',
      hasRole: (...roles: string[]) => roles.includes('OP'),
      canPerform: () => true,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByText('Send automated emails')).not.toBeInTheDocument();
  });

  it('renders create mode title when no tenantId', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('New Agency')).toBeInTheDocument();
  });

  it('renders form fields for name, legal name, timezone, currency, notes', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Legal Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Timezone')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Appointment code prefix')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('renders Create Agency button in create mode', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Agency')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open={false} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-full');
  });
});
