import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', () => ({
  PropertyType: { APARTMENT: 'APARTMENT', HOUSE: 'HOUSE' },
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

type FormOptionsArgs = [
  unknown[],
  string,
  (item: unknown) => unknown,
  Record<string, unknown> | undefined,
  { enabled?: boolean; staleTime?: number } | undefined,
];
const mockUseFormOptions = vi.fn((..._args: FormOptionsArgs) => ({
  options: [] as Array<{ value: string; label: string }>,
  isLoading: false,
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (...args: FormOptionsArgs) => mockUseFormOptions(...args),
}));

/** Stand-in for the tenant-scoped `/v1/branches` endpoint: it returns nothing
 *  unless the caller sends a `tenantId` (verified against staging — an AM with
 *  no tenant filter gets zero rows). */
function mockTenantScopedBranches(tenantId: string, branch: { value: string; label: string }) {
  mockUseFormOptions.mockImplementation((_key, path, _mapper, params) => {
    if (path === '/v1/branches' && params?.tenantId === tenantId) {
      return { options: [branch], isLoading: false };
    }
    return { options: [], isLoading: false };
  });
}

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
  id: 'prop-01', propertyCode: 'P-001', type: 'HOUSE', tenantId: 'tenant-9', branchId: 'branch-1',
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
      tenantIdOverride={props.tenantIdOverride}
      initialBranchId={props.initialBranchId}
      lockBranch={props.lockBranch}
      onCreated={props.onCreated}
    />,
    { wrapper: createWrapper() },
  );
}

/** Args of the `/v1/branches` call, or undefined when it was never requested. */
function branchOptionsCall(): FormOptionsArgs | undefined {
  return mockUseFormOptions.mock.calls.find(([, path]) => path === '/v1/branches');
}

describe('PropertyFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFormOptions.mockImplementation(() => ({ options: [], isLoading: false }));
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('New Property')).toBeInTheDocument();
    expect(screen.getByText('Create Property')).toBeInTheDocument();
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ propertyId: 'prop-01' });
    expect(screen.getByText('Edit Property')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('Property Code')).toHaveValue('P-001');
    expect(screen.getByLabelText('Street')).toHaveValue('Rua das Flores, 123');
    expect(screen.getByLabelText('Suburb')).toHaveValue('Centro');
    expect(screen.getByLabelText('Postcode')).toHaveValue('01000-000');
  });

  it('keeps structured address fields editable after selection', () => {
    renderDrawer({ propertyId: 'prop-01' });
    expect(screen.getByLabelText('Street')).not.toBeDisabled();
    expect(screen.getByLabelText('Suburb')).not.toBeDisabled();
    expect(screen.getByLabelText('Postcode')).not.toBeDisabled();
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ street: 'Required field' });
    renderDrawer();
    fireEvent.click(screen.getByText('Create Property'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  // `/v1/branches` is tenant-scoped on the backend: without a `tenantId` a
  // global role gets zero rows, which used to leave the locked Branch field
  // showing the "Select branch" placeholder instead of the inherited branch.
  it('renders the inherited branch in the locked Branch field (nested create flow)', () => {
    mockTenantScopedBranches('tenant-9', { value: 'branch-9', label: 'North Shore Office' });

    renderDrawer({ tenantIdOverride: 'tenant-9', initialBranchId: 'branch-9', lockBranch: true });

    const branch = screen.getByLabelText('Branch');
    expect(branch).toHaveTextContent('North Shore Office');
    expect(branch).toBeDisabled();
    expect(branchOptionsCall()?.[3]).toMatchObject({ tenantId: 'tenant-9' });
  });

  it('scopes the branch options to the edited property tenant', () => {
    mockTenantScopedBranches('tenant-9', { value: 'branch-1', label: 'City Office' });

    renderDrawer({ propertyId: 'prop-01' });

    expect(screen.getByLabelText('Branch')).toHaveTextContent('City Office');
    expect(branchOptionsCall()?.[3]).toMatchObject({ tenantId: 'tenant-9' });
    // Every branches call is scoped — no unscoped request slips out while the
    // property is still loading.
    const unscoped = mockUseFormOptions.mock.calls
      .filter(([, path, , params]) => path === '/v1/branches' && !params?.tenantId);
    expect(unscoped.every(([, , , , options]) => (options as { enabled?: boolean } | undefined)?.enabled === false)).toBe(true);
  });

  it('renders backend VALIDATION_ERROR details inline on the matching field', async () => {
    mockSave.mockResolvedValue({
      success: false,
      fieldErrors: { street: 'Street could not be verified' },
    });
    renderDrawer();
    fireEvent.click(screen.getByText('Create Property'));
    expect(await screen.findByText('Street could not be verified')).toBeInTheDocument();
  });
});
