import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { UserDetailDrawer } from './UserDetailDrawer';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

// Mutable holder so individual tests can make the logged-in user match (or not)
// the user being viewed, to exercise the self-deactivation guard.
const authState = vi.hoisted(() => ({ userId: 'usr-99' }));

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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: authState.userId, name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../hooks/useUserDetail', () => ({
  useUserDetail: (id: string | null) => {
    if (!id) return { user: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { user: null, isLoading: true, isError: false, refetch: vi.fn() };
    const status = id === 'usr-inactive' ? 'INACTIVE' : 'ACTIVE';
    return {
      user: {
        id, name: 'Admin Principal', email: 'admin@properfy.me', phone: '11999999999',
        role: 'AM', status, branchName: null, tenantId: null, branchId: null,
        lastLoginAt: null, twoFactorEnabled: false, permissions: [],
        createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z',
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
  },
}));


function SnackbarDisplay() {
  const { messages } = useSnackbar();
  return (
    <div data-testid="snackbar-display">
      {messages.map((m) => (
        <div key={m.id}>{m.message}</div>
      ))}
    </div>
  );
}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={testQueryClient}>
      <SnackbarProvider>
      {children}
      <SnackbarDisplay />
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

function renderDrawer(props: {
  userId: string | null;
  open: boolean;
  onClose?: () => void;
  onEdit?: (id: string) => void;
  onResetPassword?: (id: string) => void;
  scope?: 'tenant' | 'internal';
  tenantId?: string;
}) {
  return render(
    <Wrapper>
      <UserDetailDrawer
        userId={props.userId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
        onResetPassword={props.onResetPassword}
        scope={props.scope}
        tenantId={props.tenantId ?? 'ten-01'}
      />
    </Wrapper>,
  );
}

describe('UserDetailDrawer', () => {
  beforeEach(() => {
    authState.userId = 'usr-99';
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { data: {} } });
  });

  afterEach(() => {
    authState.userId = 'usr-99';
  });

  it('renders drawer with user name in header', () => {
    renderDrawer({ userId: 'usr-01', open: true });
    const matches = screen.getAllByText('Admin Principal');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows user status chip in header', () => {
    renderDrawer({ userId: 'usr-01', open: true });
    const matches = screen.getAllByText('Active');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ userId: 'usr-01', open: true });
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
    expect(screen.getAllByText('Profile').length).toBeGreaterThanOrEqual(1);
  });

  it('hides edit button when onEdit prop is not provided', () => {
    renderDrawer({ userId: 'usr-01', open: true });
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });

  it('hides reset password button when onResetPassword prop is not provided', () => {
    renderDrawer({ userId: 'usr-01', open: true });
    expect(screen.queryByLabelText('Reset Password')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ userId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ userId: 'usr-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when userId is null', () => {
    renderDrawer({ userId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal Details')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ userId: 'usr-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('edit button calls onEdit with user id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ userId: 'usr-01', open: true, onEdit });
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('usr-01');
  });

  it('reset password button calls onResetPassword with user id when prop is provided', () => {
    const onResetPassword = vi.fn();
    renderDrawer({ userId: 'usr-01', open: true, onResetPassword });
    fireEvent.click(screen.getByLabelText('Reset Password'));
    expect(onResetPassword).toHaveBeenCalledWith('usr-01');
  });

  it('shows the Deactivate button when viewing another active user', () => {
    // authState.userId is 'usr-99', viewed user is 'usr-01'
    renderDrawer({ userId: 'usr-01', open: true });
    expect(screen.getByLabelText('Deactivate User')).toBeInTheDocument();
  });

  it('hides the Deactivate button on your own account', () => {
    authState.userId = 'usr-01'; // matches the viewed user's id
    renderDrawer({ userId: 'usr-01', open: true });
    expect(screen.queryByLabelText('Deactivate User')).not.toBeInTheDocument();
  });

  it('requires a reason before calling the API', () => {
    renderDrawer({ userId: 'usr-01', open: true });
    fireEvent.click(screen.getByLabelText('Deactivate User'));
    // Confirm without typing a reason
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Reason is required');
    const textarea = screen.getByLabelText('Deactivation reason');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', alert.id);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('posts the reason on confirm', async () => {
    // usr-01 is an internal user (tenantId: null) → internal scope route.
    renderDrawer({ userId: 'usr-01', open: true, scope: 'internal' });
    fireEvent.click(screen.getByLabelText('Deactivate User'));
    fireEvent.change(screen.getByLabelText('Deactivation reason'), {
      target: { value: 'Account no longer needed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/users/usr-01/deactivate',
        { body: { reason: 'Account no longer needed' } },
      ),
    );
  });

  it('closes the drawer via onClose after a successful deactivation', async () => {
    const onClose = vi.fn();
    renderDrawer({ userId: 'usr-01', open: true, scope: 'internal', onClose });
    fireEvent.click(screen.getByLabelText('Deactivate User'));
    fireEvent.change(screen.getByLabelText('Deactivation reason'), {
      target: { value: 'No longer needed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('hides the action in tenant scope when tenantId is missing', () => {
    // Active user, another account, but no tenant context → the mutation would
    // no-op, so the action must not be exposed.
    render(
      <Wrapper>
        <UserDetailDrawer
          userId="usr-01"
          open
          onClose={vi.fn()}
          scope="tenant"
          tenantId={undefined}
        />
      </Wrapper>,
    );
    expect(screen.queryByLabelText('Deactivate User')).not.toBeInTheDocument();
  });

  it('shows Reactivate (not Deactivate) for an inactive user', () => {
    renderDrawer({ userId: 'usr-inactive', open: true });
    expect(screen.getByLabelText('Reactivate User')).toBeInTheDocument();
    expect(screen.queryByLabelText('Deactivate User')).not.toBeInTheDocument();
  });

  it('posts to the reactivate route on confirm', async () => {
    renderDrawer({ userId: 'usr-inactive', open: true, scope: 'internal' });
    fireEvent.click(screen.getByLabelText('Reactivate User'));
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/users/usr-inactive/reactivate',
        { body: {} },
      ),
    );
  });

});
