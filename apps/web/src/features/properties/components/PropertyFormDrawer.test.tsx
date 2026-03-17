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

vi.mock('../hooks/usePropertySave', () => ({
  usePropertySave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_PROPERTY = {
  id: 'prop-01', propertyCode: 'P-001', type: 'RESIDENTIAL', branchId: 'branch-1',
  street: 'Rua das Flores, 123', addressLine2: 'Apt 4', suburb: 'Centro',
  postcode: '01000-000', state: 'SP', country: 'BR', notes: 'Some notes',
};

vi.mock('../hooks/usePropertyDetail', () => ({
  usePropertyDetail: (id: string | null) => {
    if (!id) return { property: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { property: MOCK_PROPERTY, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { PropertyFormDrawer } from './PropertyFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof PropertyFormDrawer>[0]> = {}) {
  return render(
    <PropertyFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      propertyId={props.propertyId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('PropertyFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('Novo Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Criar Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Identificação')).toBeInTheDocument();
    expect(screen.getByText('Endereço')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ propertyId: 'prop-01' });
    expect(screen.getByText('Editar Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByLabelText('Código do Imóvel')).toHaveValue('P-001');
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua das Flores, 123');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Centro');
    expect(screen.getByLabelText('CEP')).toHaveValue('01000-000');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ street: 'Campo obrigatório' });
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Imóvel'));
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
