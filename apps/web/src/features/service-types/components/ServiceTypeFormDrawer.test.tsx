import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { api } from '@/services/api';

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

  // ── Behavioral coverage (#397) ──────────────────────────────────────────

  const EXISTING_TYPE = {
    id: 'st-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresRentalTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  };

  it('edit mode loads and populates the form from the detail fetch', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open serviceTypeId="st-1" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Routine Inspection'));
    expect(screen.getByLabelText('Code')).toHaveValue('ROUTINE');
  });

  it('shows a recoverable error state (not an empty form) when the detail fetch fails, and Retry refetches (#392)', async () => {
    vi.mocked(api.GET).mockResolvedValueOnce({ error: { error: { code: 'X', message: 'boom' } } } as never);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open serviceTypeId="st-1" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();

    // Retry succeeds → the form appears, populated.
    vi.mocked(api.GET).mockResolvedValueOnce({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    fireEvent.click(screen.getByText('Try Again'));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Routine Inspection'));
  });

  it('submit success in edit mode calls PATCH and onSaved', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    vi.mocked(api.PATCH).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    const onSaved = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open serviceTypeId="st-1" onClose={vi.fn()} onSaved={onSaved} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Routine Inspection'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(api.PATCH).toHaveBeenCalled());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('submit error keeps the drawer open and does not call onSaved', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    vi.mocked(api.PATCH).mockResolvedValue({ error: { error: { code: 'CONFLICT', message: 'nope' } } } as never);
    const onSaved = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open serviceTypeId="st-1" onClose={vi.fn()} onSaved={onSaved} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Routine Inspection'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(api.PATCH).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    // Form is still shown (drawer did not close/navigate away).
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
