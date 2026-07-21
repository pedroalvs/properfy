import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { UserDetailDrawer } from './UserDetailDrawer';

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
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
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
    return {
      user: {
        id: 'usr-01', name: 'Admin Principal', email: 'admin@properfy.com', phone: '11999999999',
        role: 'AM', status: 'ACTIVE', branchName: null, tenantId: null, branchId: null,
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
}) {
  return render(
    <Wrapper>
      <UserDetailDrawer
        userId={props.userId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
        onResetPassword={props.onResetPassword}
      />
    </Wrapper>,
  );
}

describe('UserDetailDrawer', () => {
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

});
