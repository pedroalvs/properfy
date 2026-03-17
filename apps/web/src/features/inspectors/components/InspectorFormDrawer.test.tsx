import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', () => ({
  contactSchema: { shape: { primaryEmail: { safeParse: () => ({ success: true }) } } },
}));
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

vi.mock('../hooks/useInspectorSave', () => ({
  useInspectorSave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_INSPECTOR = {
  id: 'insp-01', name: 'Carlos Silva', email: 'carlos@test.com',
  phone: '11888888888', document: '123.456.789-00', status: 'ACTIVE',
  regions: ['Centro', 'Norte'], serviceTypes: ['Vistoria de Entrada'],
};

vi.mock('../hooks/useInspectorDetail', () => ({
  useInspectorDetail: (id: string | null) => {
    if (!id) return { inspector: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { inspector: MOCK_INSPECTOR, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { InspectorFormDrawer } from './InspectorFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof InspectorFormDrawer>[0]> = {}) {
  return render(
    <InspectorFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      inspectorId={props.inspectorId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('InspectorFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('Novo Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Criar Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    expect(screen.getByText('Atuação')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ inspectorId: 'insp-01' });
    expect(screen.getByText('Editar Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Carlos Silva');
    expect(screen.getByLabelText('E-mail')).toHaveValue('carlos@test.com');
    expect(screen.getByLabelText('CPF')).toHaveValue('123.456.789-00');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ name: 'Campo obrigatório' });
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Inspetor'));
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
