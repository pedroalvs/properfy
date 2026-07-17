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
  phone: '11888888888', status: 'ACTIVE',
  regions: ['Centro', 'Norte'], regionIds: [], serviceTypes: [{ serviceTypeId: '123e4567-e89b-12d3-a456-426614174000', certified: false }],
  fullName: 'Carlos Alberto Silva', abn: '12345678901', dateOfBirth: '1990-05-15',
  insuranceFileKey: 'uploads/insurance.pdf', insuranceExpiresAt: '2027-06-30',
  policeCheckFileKey: 'uploads/police.pdf', policeCheckExpiresAt: '2027-12-31',
  blockedClients: ['ten-02'],
};

vi.mock('../hooks/useInspectorDetail', () => ({
  useInspectorDetail: (id: string | null) => {
    if (!id) return { inspector: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { inspector: MOCK_INSPECTOR, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { InspectorFormDrawer } from './InspectorFormDrawer';
import { api } from '@/services/api';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

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
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/tenants') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'ten-01', name: 'Imobiliaria Alpha' },
              { id: 'ten-02', name: 'Imobiliaria Beta' },
            ],
            pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
          },
        });
      }
      if (path === '/v1/service-regions') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'reg-01', name: 'North Region' },
              { id: 'reg-02', name: 'South Region' },
            ],
            pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
          },
        });
      }
      return Promise.resolve({
        data: {
          data: [
            { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Entry Inspection' },
            { id: '123e4567-e89b-12d3-a456-426614174001', name: 'Exit Inspection' },
          ],
          pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        },
      });
    });
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('New Inspector')).toBeInTheDocument();
    expect(screen.getByText('Create Inspector')).toBeInTheDocument();
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Profile & Compliance')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('Police Check')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ inspectorId: 'insp-01' });
    expect(screen.getByText('Edit Inspector')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Carlos Silva');
    expect(screen.getByLabelText('Email')).toHaveValue('carlos@test.com');
    expect(screen.queryByLabelText('Document')).not.toBeInTheDocument();
  });

  it('renders canonical service type options instead of free-text input', async () => {
    renderDrawer();
    expect(await screen.findByLabelText('Entry Inspection')).toBeInTheDocument();
    expect(screen.getByLabelText('Exit Inspection')).toBeInTheDocument();
    expect(screen.queryByLabelText('Service Types')).not.toBeInTheDocument();
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ name: 'Required field' });
    renderDrawer();
    fireEvent.click(screen.getByText('Create Inspector'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('renders blocked tenants section with tenant checkboxes for AM role', async () => {
    renderDrawer();
    const blockedTenantElements = await screen.findAllByText('Blocked Agencies');
    expect(blockedTenantElements.length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByLabelText('Imobiliaria Alpha')).toBeInTheDocument();
    expect(screen.getByLabelText('Imobiliaria Beta')).toBeInTheDocument();
  });

  it('renders profile and compliance fields', () => {
    renderDrawer();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('ABN')).toBeInTheDocument();
    expect(screen.getByLabelText('Date of Birth')).toBeInTheDocument();
    expect(screen.getByLabelText('Insurance File Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Insurance Expiry')).toBeInTheDocument();
    expect(screen.getByLabelText('Police Check File Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Police Check Expiry')).toBeInTheDocument();
  });
});
