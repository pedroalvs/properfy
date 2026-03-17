import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', () => ({
  contactSchema: { shape: { primaryEmail: { safeParse: () => ({ success: true }) } } },
  AppointmentStatus: { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', AWAITING_INSPECTOR: 'AWAITING_INSPECTOR', DONE: 'DONE', CANCELLED: 'CANCELLED', REJECTED: 'REJECTED' },
  TenantConfirmationStatus: { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', UNAVAILABLE: 'UNAVAILABLE', NO_RESPONSE: 'NO_RESPONSE' },
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

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({ options: [], isLoading: false }),
}));

const mockSave = vi.fn();
const mockValidate = vi.fn();

vi.mock('../hooks/useAppointmentSave', () => ({
  useAppointmentSave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_APPOINTMENT = {
  id: 'apt-01', branchId: 'branch-1', propertyId: 'prop-1', serviceTypeId: 'st-1',
  scheduledDate: '2026-04-01', timeSlot: '09:00-12:00', contactName: 'John Doe',
  contactPhone: '11999999999', contactEmail: 'john@test.com', keyRequired: true,
  meetingLocation: 'Lobby', keyLocation: 'Portaria', notes: 'Test notes',
};

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    if (!id) return { appointment: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { appointment: MOCK_APPOINTMENT, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { AppointmentFormDrawer } from './AppointmentFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof AppointmentFormDrawer>[0]> = {}) {
  return render(
    <AppointmentFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      appointmentId={props.appointmentId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('AppointmentFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('Nova Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Criar Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Dados da Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Contato do Inquilino')).toBeInTheDocument();
    expect(screen.getByText('Acesso e Chave')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    expect(screen.getByText('Editar Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do Inquilino')).toHaveValue('John Doe');
    expect(screen.getByLabelText('Telefone')).toHaveValue('11999999999');
    expect(screen.getByLabelText('E-mail')).toHaveValue('john@test.com');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ contactName: 'Campo obrigatório' });
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Vistoria'));
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
