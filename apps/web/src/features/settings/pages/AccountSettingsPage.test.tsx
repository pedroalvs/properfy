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
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));

const mockRefreshUser = vi.fn(() => Promise.resolve());
let mockUser: Record<string, unknown> = {};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    token: 'mock-token', isAuthenticated: true, isLoading: false,
    login: vi.fn(), logout: vi.fn(), refreshUser: mockRefreshUser,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { api } from '@/services/api';
import { AccountSettingsPage } from './AccountSettingsPage';

const mockPatch = api.PATCH as ReturnType<typeof vi.fn>;

function setUser(role: string, extra: Record<string, unknown> = {}) {
  mockUser = {
    id: 'usr-99',
    name: 'Test Admin',
    email: 'test@test.com',
    role,
    tenantId: 'tenant-1',
    phone: '+5511999999999',
    lastLoginAt: '2026-03-24T10:00:00Z',
    timezone: 'Australia/Sydney',
    personalTimezone: null,
    ...extra,
  };
}

let lastQueryClient: QueryClient;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  lastQueryClient = queryClient;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><SnackbarProvider>{children}<Snackbar /></SnackbarProvider></QueryClientProvider>;
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><AccountSettingsPage /></Wrapper>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue({ data: {}, error: undefined });
  setUser('AM');
});

describe('AccountSettingsPage', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
  });

  it('renders profile section with user info and effective timezone', () => {
    renderPage();
    expect(screen.getByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
    expect(screen.getByText('+5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
    expect(screen.getByText('Australia/Sydney')).toBeInTheDocument();
  });

  it('renders change password form', () => {
    renderPage();
    const matches = screen.getAllByText('Change Password');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('AccountSettingsPage — timezone cards per role', () => {
  it('shows the personal preference card for AM and OP, not the agency card', () => {
    for (const role of ['AM', 'OP']) {
      setUser(role);
      const { unmount } = renderPage();
      expect(screen.getByText('Timezone Preference')).toBeInTheDocument();
      expect(screen.queryByText('Agency Timezone')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows the personal preference card for INSP', () => {
    setUser('INSP');
    renderPage();
    expect(screen.getByText('Timezone Preference')).toBeInTheDocument();
  });

  it('shows the agency card for CL_ADMIN, not the personal card', () => {
    setUser('CL_ADMIN');
    renderPage();
    expect(screen.getByText('Agency Timezone')).toBeInTheDocument();
    expect(screen.queryByText('Timezone Preference')).not.toBeInTheDocument();
  });

  it('shows only a read-only row for CL_USER', () => {
    setUser('CL_USER');
    renderPage();
    expect(screen.getByText(/set by your agency/)).toBeInTheDocument();
    expect(screen.queryByText('Timezone Preference')).not.toBeInTheDocument();
    expect(screen.queryByText('Agency Timezone')).not.toBeInTheDocument();
  });
});

describe('AccountSettingsPage — CL_ADMIN agency timezone flow', () => {
  async function pickPerth(user: ReturnType<typeof userEvent.setup>) {
    const input = screen.getByRole('combobox', { name: 'Agency timezone' });
    await user.click(input);
    await user.keyboard('perth');
    await user.click(screen.getByRole('option', { name: /^Perth/ }));
  }

  it('opens the confirm dialog on Save without issuing a request', async () => {
    const user = userEvent.setup();
    setUser('CL_ADMIN');
    renderPage();

    await pickPerth(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Change agency timezone?')).toBeInTheDocument();
    expect(screen.getByText(/ALL users of this agency/)).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('cancelling the dialog issues no PATCH', async () => {
    const user = userEvent.setup();
    setUser('CL_ADMIN');
    renderPage();

    await pickPerth(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Change agency timezone?')).not.toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it('confirming PATCHes the tenant and refreshes the user', async () => {
    const user = userEvent.setup();
    setUser('CL_ADMIN');
    renderPage();

    await pickPerth(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Change timezone' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/v1/tenants/{tenantId}', {
      params: { path: { tenantId: 'tenant-1' } },
      body: { timezone: 'Australia/Perth' },
    });
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
  });
});

describe('AccountSettingsPage — personal timezone flow', () => {
  async function pickPersonalPerth(user: ReturnType<typeof userEvent.setup>) {
    const input = screen.getByRole('combobox', { name: 'Timezone' });
    await user.click(input);
    await user.keyboard('perth');
    await user.click(screen.getByRole('option', { name: /^Perth/ }));
  }

  it('saving the personal preference PATCHes /v1/me and refreshes the user', async () => {
    const user = userEvent.setup();
    setUser('OP');
    renderPage();

    await pickPersonalPerth(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/v1/me', {
      body: { timezone: 'Australia/Perth' },
    });
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
  });

  it('disables Save while the value is unchanged from the stored preference', () => {
    setUser('OP', { personalTimezone: null });
    renderPage();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('clearing an existing preference saves { timezone: null }', async () => {
    const user = userEvent.setup();
    setUser('OP', { personalTimezone: 'Australia/Perth' });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Clear timezone selection' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/v1/me', { body: { timezone: null } });
  });

  it('still shows success and invalidates queries when refreshUser rejects', async () => {
    const user = userEvent.setup();
    setUser('OP');
    mockRefreshUser.mockRejectedValueOnce(new Error('network'));
    renderPage();
    const invalidateSpy = vi.spyOn(lastQueryClient, 'invalidateQueries');

    await pickPersonalPerth(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Timezone preference saved'),
    );
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
