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
    defaultDurationMinutes: 45,
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

  // ── F04-5: Estimated duration (min) ─────────────────────────────────────

  it('renders a required "Estimated duration (min)" field after Flow Type, with help text linked by aria-describedby', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const input = screen.getByLabelText('Estimated duration (min)');
    expect(input).toBeInTheDocument();
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Time the inspector spends at each stop. Used to plan the day route.',
    );
  });

  it('create: blocks save and shows the duration validation messages', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Create Service Type'));
    expect(await screen.findByText('Enter the duration in minutes')).toBeInTheDocument();
    expect(api.POST).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Estimated duration (min)'), { target: { value: '4' } });
    fireEvent.click(screen.getByText('Create Service Type'));
    expect(await screen.findByText('Enter a duration between 5 and 480 minutes')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Estimated duration (min)'), { target: { value: '45.5' } });
    fireEvent.click(screen.getByText('Create Service Type'));
    expect(await screen.findByText('Enter whole minutes')).toBeInTheDocument();
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('create: a valid form POSTs defaultDurationMinutes as a number', async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: { data: { id: 'new' } }, error: undefined } as never);
    const onSaved = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open onClose={vi.fn()} onSaved={onSaved} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'ROUTINE_IN' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Routine Ingoing' } });
    // Flow Type (custom SelectInput): open and pick "Routine".
    fireEvent.click(screen.getByLabelText('Flow Type'));
    fireEvent.click(screen.getByText('Routine'));
    fireEvent.change(screen.getByLabelText('Estimated duration (min)'), { target: { value: '60' } });
    fireEvent.click(screen.getByText('Create Service Type'));

    await waitFor(() => expect(api.POST).toHaveBeenCalled());
    expect(api.POST).toHaveBeenCalledWith('/v1/service-types', {
      body: {
        code: 'ROUTINE_IN',
        name: 'Routine Ingoing',
        flowType: 'ROUTINE',
        requiresRentalTenantConfirmation: true,
        defaultDurationMinutes: 60,
      },
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('edit: loads the stored duration and PATCHes the changed value', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    vi.mocked(api.PATCH).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open serviceTypeId="st-1" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Estimated duration (min)')).toHaveValue('45'),
    );
    fireEvent.change(screen.getByLabelText('Estimated duration (min)'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(api.PATCH).toHaveBeenCalled());
    expect(api.PATCH).toHaveBeenCalledWith('/v1/service-types/{serviceTypeId}', {
      params: { path: { serviceTypeId: 'st-1' } },
      body: {
        name: 'Routine Inspection',
        flowType: 'ROUTINE',
        requiresRentalTenantConfirmation: true,
        defaultDurationMinutes: 50,
      },
    });
  });

  it('edit: a server 400 on the duration maps to the field', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: { data: EXISTING_TYPE }, error: undefined } as never);
    vi.mocked(api.PATCH).mockResolvedValue({
      error: { error: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid', details: [{ field: 'defaultDurationMinutes', message: 'Required' }] } },
    } as never);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ServiceTypeFormDrawer open serviceTypeId="st-1" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Routine Inspection'));
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Required')).toBeInTheDocument();
  });
});
