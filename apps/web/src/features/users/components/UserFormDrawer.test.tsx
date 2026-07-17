import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}));
vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
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
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Admin', email: 'admin@test.com', role: 'AM', tenantId: 't-1' },
    token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({ options: [], isLoading: false }),
}));

const mockSave = vi.fn();
const mockValidate = vi.fn();

vi.mock('../hooks/useUserSave', () => ({
  useUserSave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_USER = {
  id: 'usr-01', name: 'Maria Test', email: 'maria@test.com',
  phone: '11777777777', role: 'CL_ADMIN', status: 'ACTIVE', branchId: 'b-1',
};

vi.mock('../hooks/useUserDetail', () => ({
  useUserDetail: (id: string | null) => {
    if (!id) return { user: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { user: MOCK_USER, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { UserFormDrawer } from './UserFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof UserFormDrawer>[0]> = {}) {
  return render(
    <UserFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      userId={props.userId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('UserFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('New User')).toBeInTheDocument();
    expect(screen.getByText('Create User')).toBeInTheDocument();
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
    expect(screen.getByText('Assignment')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ userId: 'usr-01' });
    expect(screen.getByText('Edit User')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Maria Test');
    expect(screen.getByLabelText('Email')).toHaveValue('maria@test.com');
    expect(screen.getByLabelText('Phone')).toHaveValue('11777777777');
  });

  it('shows an inline AU phone error when an invalid phone is blurred', () => {
    renderDrawer();
    const phone = screen.getByLabelText('Phone');
    fireEvent.change(phone, { target: { value: '123' } });
    fireEvent.blur(phone);
    expect(screen.getByText('Enter a valid Australian phone number')).toBeInTheDocument();
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ name: 'Required field' });
    renderDrawer();
    fireEvent.click(screen.getByText('Create User'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
