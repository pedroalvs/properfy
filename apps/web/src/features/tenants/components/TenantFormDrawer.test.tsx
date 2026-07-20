import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(() => ({ role: 'AM', hasRole: () => true, canPerform: () => true })),
}));

import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/services/api';
import { TenantFormDrawer } from './TenantFormDrawer';

const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;
const mockPost = vi.mocked(api.POST);

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

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePermissions.mockReturnValue({ role: 'AM', hasRole: () => true, canPerform: () => true });
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Test Agency');
  await user.type(screen.getByLabelText('Legal Name'), 'Test Agency LLC');
  await user.click(screen.getByRole('button', { name: 'Currency' }));
  await user.click(screen.getByRole('option', { name: 'AUD - Australian Dollar' }));
  await user.type(screen.getByLabelText('Appointment code prefix'), 'TST');
}

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

  it('renders form fields for name, legal name, currency, notes (timezone is fixed to Sydney)', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Legal Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument();
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

describe('TenantFormDrawer – submit behavior', () => {
  it('blocks submit and shows inline errors when required fields are empty', async () => {
    const user = userEvent.setup();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: 'Create Agency' }));

    expect(screen.getAllByText('Required field').length).toBeGreaterThan(0);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls save, shows success snackbar and invokes onSaved on successful submit', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockPost.mockResolvedValueOnce({ data: { id: 'ten-1' }, error: undefined });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={onSaved} />
      </Wrapper>,
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create Agency' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Agency created successfully'),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('shows error snackbar and does not call onSaved when save fails', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'Server error' } },
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={onSaved} />
      </Wrapper>,
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create Agency' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Server error'),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows inline prefix error on TENANT_PREFIX_CONFLICT without calling onSaved', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'TENANT_PREFIX_CONFLICT', message: 'Conflict' } },
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={onSaved} />
      </Wrapper>,
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create Agency' }));

    await waitFor(() =>
      expect(
        screen.getByText('This prefix is already in use by another agency'),
      ).toBeInTheDocument(),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('TenantFormDrawer – discard-confirm behavior', () => {
  it('shows confirm dialog when cancelling with unsaved changes', async () => {
    const user = userEvent.setup();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText('Name'), 'Dirty');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
  });

  it('calls onClose after confirming discard', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={onClose} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText('Name'), 'Dirty');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps drawer open when continuing to edit', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={onClose} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await user.type(screen.getByLabelText('Name'), 'Dirty');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Continue editing' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('closes immediately without confirm when no changes have been made', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={onClose} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });
});
