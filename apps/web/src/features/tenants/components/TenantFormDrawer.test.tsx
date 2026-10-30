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
const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = vi.mocked(api.POST);
// Untyped like mockGet above: the F00 map-window tests resolve loose response
// shapes and read `mock.calls[n][1].body`, which the strict openapi-fetch PATCH
// signature narrows to `never`. The GET mock on line 31 uses the same cast.
const mockPatch = api.PATCH as unknown as ReturnType<typeof vi.fn>;

const OP_PERMISSIONS = {
  role: 'OP',
  hasRole: (...roles: string[]) => roles.includes('OP'),
  canPerform: () => true,
};
const CL_ADMIN_PERMISSIONS = {
  role: 'CL_ADMIN',
  hasRole: (...roles: string[]) => roles.includes('CL_ADMIN'),
  canPerform: () => true,
};

/** Resolve the tenant-detail GET with a row whose settingsJson is as given. */
function mockTenantDetail(settingsJson?: Record<string, unknown>) {
  mockGet.mockResolvedValueOnce({
    data: {
      data: {
        id: 'ten-01',
        name: 'Existing Agency',
        legalName: 'Existing Agency Pty Ltd',
        status: 'ACTIVE',
        branchCount: 1,
        timezone: 'Australia/Sydney',
        currency: 'AUD',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z',
        appointmentCodePrefix: 'EXA',
        notes: null,
        ...(settingsJson ? { settingsJson } : {}),
      },
    },
  });
}

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
  it('shows the tenant notifications toggle for AM', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Send notifications to tenants (email and SMS)')).toBeInTheDocument();
  });

  it('hides the tenant notifications toggle for non-AM roles (OP)', () => {
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
    expect(screen.queryByText('Send notifications to tenants (email and SMS)')).not.toBeInTheDocument();
  });

  it('fails closed when persisted notification settings conflict', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          id: 'ten-01',
          name: 'Mixed Version Agency',
          legalName: 'Mixed Version Agency Pty Ltd',
          status: 'ACTIVE',
          branchCount: 1,
          timezone: 'Australia/Sydney',
          currency: 'AUD',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-31T00:00:00.000Z',
          appointmentCodePrefix: 'MVA',
          notes: null,
          settingsJson: {
            rentalTenantNotificationsEnabled: true,
            emailSendingEnabled: false,
          },
        },
      },
    });
    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <TenantFormDrawer
          open
          tenantId="ten-01"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </Wrapper>,
    );

    // Wait for the async tenant load to settle the derived checkbox state.
    // findByRole only waits for the checkbox to EXIST (it renders before the
    // query resolves), so asserting .not.toBeChecked() on it directly raced the
    // fail-closed populate under the full parallel CI suite. Poll the state.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', {
        name: 'Send notifications to tenants (email and SMS)',
      })).not.toBeChecked();
    });
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
    // Sydney is pre-selected so existing agencies keep their default.
    expect((screen.getByLabelText('Timezone') as HTMLInputElement).value).toMatch(/^Sydney/);
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

  it('includes the selected timezone in the create payload', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({ data: { id: 'ten-1' }, error: undefined });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await fillRequiredFields(user);
    const timezoneInput = screen.getByLabelText('Timezone');
    await user.click(timezoneInput);
    await user.keyboard('perth');
    await user.click(screen.getByRole('option', { name: /^Perth/ }));
    await user.click(screen.getByRole('button', { name: 'Create Agency' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/tenants',
      expect.objectContaining({
        body: expect.objectContaining({ timezone: 'Australia/Perth' }),
      }),
    );
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

  it('renders backend VALIDATION_ERROR details inline on the matching field', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockPost.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'legalName', message: 'Legal name is too long' }],
        },
      },
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
      expect(screen.getByText('Legal name is too long')).toBeInTheDocument(),
    );
    // Fully mapped details render inline only — no summary snackbar.
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
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

describe('TenantFormDrawer – map window (F00)', () => {
  const MAP_LABEL = 'Map window (days)';

  beforeEach(() => {
    mockPatch.mockResolvedValue({ data: { data: { id: 'ten-01' } }, error: undefined });
  });

  async function findMapInput() {
    return (await screen.findByLabelText(MAP_LABEL)) as HTMLInputElement;
  }

  it('W1: AM edit shows the map window prefilled from settings alongside the normal sections', async () => {
    mockTenantDetail({ mapWindowDays: 30 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    expect(input.value).toBe('30');
    // Normal AM sections remain present.
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Timezone')).toBeInTheDocument();
  });

  it('W2: AM edit defaults the map window to 14 when settings omit the key', async () => {
    mockTenantDetail();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    expect(input.value).toBe('14');
  });

  it('W3: OP edit shows ONLY the Map section (no general fields)', async () => {
    mockUsePermissions.mockReturnValue(OP_PERMISSIONS);
    mockTenantDetail({ mapWindowDays: 30 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    expect(input.value).toBe('30');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Legal Name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument();
  });

  it('W4: CL_ADMIN edit does not show the Map section', async () => {
    mockUsePermissions.mockReturnValue(CL_ADMIN_PERMISSIONS);
    mockTenantDetail({ mapWindowDays: 30 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    // General fields load; the map window never appears.
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText(MAP_LABEL)).not.toBeInTheDocument();
  });

  it('W5: create mode (AM) omits the Map section entirely', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByLabelText(MAP_LABEL)).not.toBeInTheDocument();
  });

  it('W7: AM save sends settings.mapWindowDays as a number alongside the rest', async () => {
    const user = userEvent.setup();
    mockTenantDetail({ mapWindowDays: 30 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    await findMapInput();
    // Make the form dirty via a general field while leaving the window at 30.
    await user.type(screen.getByLabelText('Name'), ' Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    const body = mockPatch.mock.calls[0]![1].body as {
      settings: { mapWindowDays: number };
      name: string;
    };
    expect(body.settings.mapWindowDays).toBe(30);
    expect(body.name).toContain('Updated');
  });

  it('W8: OP save body is exactly { settings: { mapWindowDays } }', async () => {
    const user = userEvent.setup();
    mockUsePermissions.mockReturnValue(OP_PERMISSIONS);
    mockTenantDetail(); // defaults the window to 14
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    await user.clear(input);
    await user.type(input, '30');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/{tenantId}', {
      params: { path: { tenantId: 'ten-01' } },
      body: { settings: { mapWindowDays: 30 } },
    });
  });

  it('W9: invalid map window values block the save and show an inline error', async () => {
    for (const bad of ['', '0', '91', '7.5']) {
      mockUsePermissions.mockReturnValue(OP_PERMISSIONS);
      mockPatch.mockClear();
      mockTenantDetail({ mapWindowDays: 30 });
      const Wrapper = createWrapper();
      const { unmount } = render(
        <Wrapper>
          <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
        </Wrapper>,
      );
      const user = userEvent.setup();
      const input = await findMapInput();
      await user.clear(input);
      if (bad) await user.type(input, bad);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Enter a whole number between 1 and 90.'),
      ).toBeInTheDocument();
      expect(mockPatch).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('W10: a backend VALIDATION_ERROR on settings.mapWindowDays renders inline on the field', async () => {
    const user = userEvent.setup();
    mockUsePermissions.mockReturnValue(OP_PERMISSIONS);
    mockTenantDetail({ mapWindowDays: 14 });
    mockPatch.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'settings.mapWindowDays', message: 'Server rejected the window' }],
        },
      },
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    await user.clear(input);
    await user.type(input, '31');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Server rejected the window')).toBeInTheDocument();
  });

  it('W11: Save is disabled until the map window changes and re-disabled when reverted', async () => {
    const user = userEvent.setup();
    mockUsePermissions.mockReturnValue(OP_PERMISSIONS);
    mockTenantDetail({ mapWindowDays: 30 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, '31');
    expect(save).toBeEnabled();

    await user.clear(input);
    await user.type(input, '30');
    expect(save).toBeDisabled();
  });

  it('W12: the help text is present and wired via aria-describedby', async () => {
    mockTenantDetail({ mapWindowDays: 14 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <TenantFormDrawer open tenantId="ten-01" onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );

    const input = await findMapInput();
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const help = document.getElementById(describedBy!);
    expect(help).not.toBeNull();
    expect(help!.textContent).toContain(
      'Days ahead of today the map shows by default (1–90). Default: 14 (today through 14 days ahead).',
    );
  });
});
