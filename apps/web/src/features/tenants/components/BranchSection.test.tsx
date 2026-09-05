import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

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

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(() => ({
    role: 'AM',
    hasRole: () => true,
    canPerform: () => true,
    hasClUserFlag: () => true,
  })),
}));

import { api } from '@/services/api';
import { usePermissions } from '@/hooks/usePermissions';
import { BranchSection } from './BranchSection';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

const MOCK_BRANCHES = [
  { id: 'br-01', tenantId: 'ten-01', name: 'Centro', address: 'Rua Augusta, 100', contactEmail: 'centro@imob.com', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'br-02', tenantId: 'ten-01', name: 'Zona Sul', address: null, contactEmail: null, status: 'INACTIVE', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_BRANCHES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
  mockPost.mockResolvedValue({ data: { data: {} } });
  mockUsePermissions.mockReturnValue({
    role: 'AM',
    hasRole: () => true,
    canPerform: () => true,
    hasClUserFlag: () => true,
  });
});

describe('BranchSection', () => {
  it('renders section title', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);
    expect(screen.getByText('Branches')).toBeInTheDocument();
  });

  it('renders Add Branch button', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);
    expect(screen.getByText('Add Branch')).toBeInTheDocument();
  });

  it('renders branch data after loading', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument();
    });

    expect(screen.getByText('Zona Sul')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);
    expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Address').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Contact Email').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Deactivate for active branches and Activate for inactive branches', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument();
    });

    // One ACTIVE row (Centro) → Deactivate; one INACTIVE row (Zona Sul) → Activate.
    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Activate' })).toHaveLength(1);
  });

  it('hides status actions for roles without AM/OP', async () => {
    mockUsePermissions.mockReturnValue({
      role: 'CL_ADMIN',
      hasRole: (...roles: string[]) => roles.includes('CL_ADMIN'),
      canPerform: () => false,
      hasClUserFlag: () => false,
    });
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument();
    });

    // Edit stays available; status actions are gated to AM/OP.
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
  });

  it('opens the confirmation dialog and activates an inactive branch', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><BranchSection tenantId="ten-01" /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Zona Sul')).toBeInTheDocument();
    });

    // Row action button (only the inactive row exposes "Activate").
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    // Confirmation dialog appears (scoped by its accessible name, since a closed
    // DeactivateBranchModal also carries role="dialog").
    const dialog = await screen.findByRole('dialog', { name: 'Activate Branch' });

    // Confirm inside the dialog (its confirm button also reads "Activate").
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/tenants/ten-01/branches/br-02/activate',
        { body: {} },
      );
    });
  });
});
