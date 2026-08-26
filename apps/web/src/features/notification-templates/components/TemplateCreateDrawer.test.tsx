import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MANDATORY_TEMPLATE_CODES } from '@properfy/shared';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { TemplateCreateDrawer } from './TemplateCreateDrawer';

const mockPut = api.PUT as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

const TENANT_OPTIONS = [
  { value: 'agency-1', label: 'Acme Realty' },
  { value: 'agency-2', label: 'Globex' },
];

// GET .../default response — the create drawer prefills from this endpoint,
// never from the loaded list (which can be filtered or stale).
const DEFAULT_RESULT = {
  subject: 'Inspection notice',
  body: 'Hi {{rentalTenantName}} at {{propertyAddress}} on {{scheduledDate}} {{timeSlot}}',
  source: 'PLATFORM_DEFAULT',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter>{children}</MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

interface Overrides {
  isGlobalRole?: boolean;
  pinnedTenantId?: string | null;
}

function renderDrawer(overrides: Overrides = {}) {
  const Wrapper = createWrapper();
  const onSaved = vi.fn();
  render(
    <Wrapper>
      <TemplateCreateDrawer
        open
        onClose={vi.fn()}
        onSaved={onSaved}
        tenantOptions={TENANT_OPTIONS}
        isGlobalRole={overrides.isGlobalRole ?? true}
        pinnedTenantId={overrides.pinnedTenantId}
      />
    </Wrapper>,
  );
  return { onSaved };
}

async function selectCode(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: 'Template type' }));
  const listbox = screen.getByRole('listbox', { name: 'Template type' });
  await user.click(within(listbox).getByText(label));
}

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockResolvedValue({ data: { data: { id: 'tpl-new' } } });
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: DEFAULT_RESULT } });
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { data: { subjectRendered: '', htmlRendered: '' } } });
});

/** The prefill from GET .../default is async — wait for it to land. */
async function waitForPrefill() {
  await waitFor(() => {
    expect(screen.getByLabelText('Body')).toHaveValue(DEFAULT_RESULT.body);
  });
}

describe('TemplateCreateDrawer', () => {
  it('renders the code dropdown with all mandatory codes', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Template type' }));
    const listbox = screen.getByRole('listbox', { name: 'Template type' });
    // Derived, not hardcoded: the dropdown is built from MANDATORY_TEMPLATE_CODES,
    // so a literal count silently fails every time a template code is added.
    expect(within(listbox).getAllByRole('option')).toHaveLength(
      MANDATORY_TEMPLATE_CODES.length,
    );
  });

  it('shows the agency selector for global roles', () => {
    renderDrawer({ isGlobalRole: true });
    expect(screen.getByRole('button', { name: 'Agency' })).toBeInTheDocument();
  });

  it('hides the agency selector for CL_ADMIN (pinned tenant)', () => {
    renderDrawer({ isGlobalRole: false, pinnedTenantId: 'cl-1' });
    expect(screen.queryByRole('button', { name: 'Agency' })).not.toBeInTheDocument();
  });

  it('prefills subject and body from GET .../default when a code is selected', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await selectCode(user, 'Inspection Notice');

    await waitForPrefill();
    expect(mockGet).toHaveBeenCalledWith(
      '/v1/notification-templates/{templateCode}/{channel}/default',
      expect.objectContaining({
        params: expect.objectContaining({ path: { templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL' } }),
      }),
    );
    expect(screen.getByLabelText('Subject')).toHaveValue('Inspection notice');
  });

  it('shows the derived channel (SMS) and hides the Subject field for an SMS code', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      data: { data: { subject: null, body: 'Hi {{rentalTenantName}}', source: 'PLATFORM_DEFAULT' } },
    });
    renderDrawer();
    await selectCode(user, 'Inspection Notice (SMS)');
    expect(screen.getByText('SMS')).toBeInTheDocument();
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
  });

  it('blocks submit and shows an error when no code is selected', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByText('Create Template'));
    expect(await screen.findByText('Select a template')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('disables Send Test until an agency is selected (global role)', async () => {
    const user = userEvent.setup();
    renderDrawer({ isGlobalRole: true });

    await selectCode(user, 'Inspection Notice');
    await waitForPrefill();
    // Code + body present, but no agency yet — a test now would silently
    // target the platform scope instead of the override being created.
    expect(screen.getByRole('button', { name: 'Send Test Email' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Agency' }));
    const agencyList = screen.getByRole('listbox', { name: 'Agency' });
    await user.click(within(agencyList).getByText('Acme Realty'));

    expect(screen.getByRole('button', { name: 'Send Test Email' })).toBeEnabled();
  });

  it('submits with the tenantId chosen in the agency selector', async () => {
    const user = userEvent.setup();
    renderDrawer({ isGlobalRole: true });

    await selectCode(user, 'Inspection Notice');
    await waitForPrefill();
    await user.click(screen.getByRole('button', { name: 'Agency' }));
    const agencyList = screen.getByRole('listbox', { name: 'Agency' });
    await user.click(within(agencyList).getByText('Acme Realty'));

    await user.click(screen.getByText('Create Template'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
        expect.objectContaining({ body: expect.objectContaining({ tenantId: 'agency-1', isActive: true }) }),
      );
    });
  });

  it('submits with the pinned tenantId for CL_ADMIN', async () => {
    const user = userEvent.setup();
    renderDrawer({ isGlobalRole: false, pinnedTenantId: 'cl-1' });

    await selectCode(user, 'Inspection Notice');
    await waitForPrefill();
    await user.click(screen.getByText('Create Template'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
        expect.objectContaining({ body: expect.objectContaining({ tenantId: 'cl-1' }) }),
      );
    });
  });

  // The prefill sequence guard (prefillSeqRef) must drop a fetchDefault response
  // that resolves after the operator has moved on. These keep the request pending
  // across the invalidating action, then resolve it and assert it is ignored.
  describe('stale prefill guard', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    it('keeps an operator edit when a late default response resolves', async () => {
      const user = userEvent.setup();
      const pending = deferred<{ data: { data: typeof DEFAULT_RESULT } }>();
      // The fetchDefault triggered by selecting the code never resolves until we say so.
      mockGet.mockReturnValueOnce(pending.promise);
      renderDrawer();

      await selectCode(user, 'Inspection Notice');
      const body = screen.getByLabelText('Body');
      await user.type(body, 'Operator draft');

      // The stale default finally lands — the edit must survive.
      pending.resolve({ data: { data: DEFAULT_RESULT } });
      await waitFor(() => expect(body).toHaveValue('Operator draft'));
      expect(body).not.toHaveValue(DEFAULT_RESULT.body);
    });

    it('ignores a default response for a code the operator switched away from', async () => {
      const user = userEvent.setup();
      const stale = deferred<{ data: { data: { subject: string; body: string } } }>();
      // First code's default stays pending; the second code uses the resolving mock.
      mockGet.mockReturnValueOnce(stale.promise);
      renderDrawer();

      await selectCode(user, 'Inspection Notice');
      await selectCode(user, 'Reminder – 7 Days');
      await waitForPrefill();

      // The first code's response arrives last and must not overwrite the current code.
      stale.resolve({ data: { data: { subject: 'STALE', body: 'STALE BODY' } } });
      await waitFor(() => expect(screen.getByLabelText('Body')).toHaveValue(DEFAULT_RESULT.body));
      expect(screen.getByLabelText('Body')).not.toHaveValue('STALE BODY');
      expect(screen.getByLabelText('Subject')).not.toHaveValue('STALE');
    });
  });
});
