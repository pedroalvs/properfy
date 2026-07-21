import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import type { NotificationTemplate } from '../types';

const mockPut = api.PUT as ReturnType<typeof vi.fn>;

const TENANT_OPTIONS = [
  { value: 'agency-1', label: 'Acme Realty' },
  { value: 'agency-2', label: 'Globex' },
];

// Platform default for INSPECTION_NOTICE with all required vars, so prefill yields a valid form.
const PLATFORM_DEFAULTS: NotificationTemplate[] = [
  {
    id: 'd1',
    tenantId: null,
    rentalTenantName: null,
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection notice',
    body: 'Hi {{rentalTenantName}} at {{propertyAddress}} on {{scheduledDate}} {{timeSlot}}',
    active: true,
    notificationClass: 'OPERATIONAL',
    requiredVariables: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

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
  platformDefaults?: NotificationTemplate[];
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
        platformDefaults={overrides.platformDefaults ?? PLATFORM_DEFAULTS}
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
});

describe('TemplateCreateDrawer', () => {
  it('renders the code dropdown with all mandatory codes', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Template type' }));
    const listbox = screen.getByRole('listbox', { name: 'Template type' });
    expect(within(listbox).getAllByRole('option')).toHaveLength(21);
  });

  it('shows the agency selector for global roles', () => {
    renderDrawer({ isGlobalRole: true });
    expect(screen.getByRole('button', { name: 'Agency' })).toBeInTheDocument();
  });

  it('hides the agency selector for CL_ADMIN (pinned tenant)', () => {
    renderDrawer({ isGlobalRole: false, pinnedTenantId: 'cl-1' });
    expect(screen.queryByRole('button', { name: 'Agency' })).not.toBeInTheDocument();
  });

  it('prefills subject and body from the platform default when a code is selected', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await selectCode(user, 'Inspection Notice');

    expect(screen.getByLabelText('Subject')).toHaveValue('Inspection notice');
    expect(screen.getByLabelText('Body')).toHaveValue(
      'Hi {{rentalTenantName}} at {{propertyAddress}} on {{scheduledDate}} {{timeSlot}}',
    );
  });

  it('shows the derived channel (SMS) after selecting an SMS code', async () => {
    const user = userEvent.setup();
    renderDrawer({ platformDefaults: [] });
    await selectCode(user, 'Inspection Notice (SMS)');
    expect(screen.getByText('SMS')).toBeInTheDocument();
  });

  it('blocks submit and shows an error when no code is selected', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByText('Create Template'));
    expect(await screen.findByText('Select a template')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('submits with the tenantId chosen in the agency selector', async () => {
    const user = userEvent.setup();
    renderDrawer({ isGlobalRole: true });

    await selectCode(user, 'Inspection Notice');
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
    await user.click(screen.getByText('Create Template'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL',
        expect.objectContaining({ body: expect.objectContaining({ tenantId: 'cl-1' }) }),
      );
    });
  });
});
