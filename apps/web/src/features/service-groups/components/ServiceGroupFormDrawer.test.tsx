import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', () => ({}));
vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  ApiError: class extends Error {},
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

const mockSave = vi.fn();
const mockValidate = vi.fn();

vi.mock('../hooks/useServiceGroupSave', () => ({
  useServiceGroupSave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_SERVICE_GROUP = {
  id: 'sg-01', name: 'Group Alpha', regionName: 'Centro',
  priorityMode: 'STANDARD', description: 'Test group',
};

vi.mock('../hooks/useServiceGroupDetail', () => ({
  useServiceGroupDetail: (id: string | null) => {
    if (!id) return { serviceGroup: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { serviceGroup: MOCK_SERVICE_GROUP, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { ServiceGroupFormDrawer } from './ServiceGroupFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof ServiceGroupFormDrawer>[0]> = {}) {
  return render(
    <ServiceGroupFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      serviceGroupId={props.serviceGroupId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('ServiceGroupFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('Novo Grupo')).toBeInTheDocument();
    expect(screen.getByText('Criar Grupo')).toBeInTheDocument();
    expect(screen.getByText('Informações')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ serviceGroupId: 'sg-01' });
    expect(screen.getByText('Editar Grupo')).toBeInTheDocument();
    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Group Alpha');
    expect(screen.getByLabelText('Região')).toHaveValue('Centro');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ name: 'Campo obrigatório' });
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Grupo'));
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
