import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { InspectorDetailDrawer } from './InspectorDetailDrawer';

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

let mockUserRole = 'AM';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: mockUserRole, tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../hooks/useInspectorDetail', () => ({
  useInspectorDetail: (id: string | null) => {
    if (!id) return { inspector: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { inspector: null, isLoading: true, isError: false, refetch: vi.fn() };
    if (id === 'inactive') {
      return {
        inspector: {
          id: 'insp-02', name: 'Inactive Inspector', email: 'inactive@test.com', phone: null,
          status: 'INACTIVE' as const, regions: [], regionIds: [], serviceTypes: [],
          regionsCount: 0, serviceTypesCount: 0,
          createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z',
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      };
    }
    return {
      inspector: {
        id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', phone: '11999999999',
        status: 'ACTIVE' as const, regions: ['Zona Sul'], regionIds: [], serviceTypes: [{ serviceTypeId: 'Vistoria', certified: false }],
        regionsCount: 1, serviceTypesCount: 1,
        createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z',
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
  },
}));

const mockDeactivate = vi.fn();
vi.mock('../hooks/useInspectorDeactivate', () => ({
  useInspectorDeactivate: () => ({
    deactivate: mockDeactivate,
    isDeactivating: false,
  }),
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

function renderDrawer(props: { inspectorId: string | null; open: boolean; onClose?: () => void; onEdit?: (id: string) => void }) {
  return render(
    <Wrapper>
      <InspectorDetailDrawer
        inspectorId={props.inspectorId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

describe('InspectorDetailDrawer', () => {
  it('renders drawer with inspector name in header', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    const matches = screen.getAllByText('Carlos Silva');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inspector status chip in header', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows detail sections', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
  });

  it('hides edit button when onEdit prop is not provided', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ inspectorId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ inspectorId: 'insp-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when inspectorId is null', () => {
    renderDrawer({ inspectorId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal Details')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ inspectorId: 'insp-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('edit button calls onEdit with inspector id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ inspectorId: 'insp-01', open: true, onEdit });
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('insp-01');
  });

  it('shows deactivate button for AM role when inspector is ACTIVE', () => {
    mockUserRole = 'AM';
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.getByLabelText('Deactivate')).toBeInTheDocument();
  });

  it('hides deactivate button for non AM/OP roles', () => {
    mockUserRole = 'CL_ADMIN';
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.queryByLabelText('Deactivate')).not.toBeInTheDocument();
    mockUserRole = 'AM';
  });

  it('hides deactivate button when inspector is INACTIVE', () => {
    mockUserRole = 'AM';
    renderDrawer({ inspectorId: 'inactive', open: true });
    expect(screen.queryByLabelText('Deactivate')).not.toBeInTheDocument();
  });

  it('opens deactivate dialog on button click and requires reason', () => {
    mockUserRole = 'AM';
    renderDrawer({ inspectorId: 'insp-01', open: true });
    fireEvent.click(screen.getByLabelText('Deactivate'));
    expect(screen.getByText('Deactivate Inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Deactivation reason')).toBeInTheDocument();

    // Find the confirm "Deactivate" button by text within the modal dialog
    const allDeactivateButtons = screen.getAllByText('Deactivate');
    const confirmButton = allDeactivateButtons.find(
      (el) => el.tagName === 'BUTTON' && el.textContent === 'Deactivate',
    )!;
    fireEvent.click(confirmButton);
    expect(screen.getByText('Reason is required')).toBeInTheDocument();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it('calls deactivate with reason when provided', () => {
    mockUserRole = 'AM';
    renderDrawer({ inspectorId: 'insp-01', open: true });
    fireEvent.click(screen.getByLabelText('Deactivate'));
    fireEvent.change(screen.getByLabelText('Deactivation reason'), { target: { value: 'Poor performance' } });
    const allDeactivateButtons = screen.getAllByText('Deactivate');
    const confirmButton = allDeactivateButtons.find(
      (el) => el.tagName === 'BUTTON' && el.textContent === 'Deactivate',
    )!;
    fireEvent.click(confirmButton);
    expect(mockDeactivate).toHaveBeenCalledWith('Poor performance');
  });
});

describe('InspectorDetailDrawer — Availability tab (T027)', () => {
  beforeEach(() => { mockUserRole = 'AM'; });

  it('renders TabsNav with Details and Availability tabs', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    const tabs = screen.getAllByRole('tab');
    const tabLabels = tabs.map((t) => t.textContent);
    expect(tabLabels).toContain('Details');
    expect(tabLabels).toContain('Availability');
  });

  it('defaults to Details tab being active', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    const detailsTab = screen.getByRole('tab', { name: 'Details' });
    expect(detailsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
  });

  it('switches to Availability tab on click', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    fireEvent.click(screen.getByRole('tab', { name: 'Availability' }));
    const availTab = screen.getByRole('tab', { name: 'Availability' });
    expect(availTab).toHaveAttribute('aria-selected', 'true');
  });

  it('does not show Availability tab for non-AM/OP roles', () => {
    mockUserRole = 'CL_ADMIN';
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.queryByRole('tab', { name: 'Availability' })).not.toBeInTheDocument();
    mockUserRole = 'AM';
  });
});
