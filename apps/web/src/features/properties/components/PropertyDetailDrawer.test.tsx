import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { PropertyDetailDrawer } from './PropertyDetailDrawer';

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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
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

vi.mock('../hooks/usePropertyDetail', () => ({
  usePropertyDetail: (id: string | null) => {
    if (!id) return { property: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { property: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      property: {
        id: 'prop-01', propertyCode: 'IMV-001', type: 'RESIDENTIAL', branchName: 'Filial Centro',
        tenantId: 'tenant-1', branchId: 'branch-1',
        street: 'Rua das Flores, 123', addressLine2: null, suburb: 'Centro', postcode: '01001-000', state: 'SP',
        country: 'BR', latitude: -23.5, longitude: -46.6, geocodingStatus: 'SUCCESS',
        notes: null, createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
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

import { MemoryRouter } from 'react-router-dom';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={testQueryClient}>
      <SnackbarProvider>
        <MemoryRouter>
          {children}
          <SnackbarDisplay />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

function renderDrawer(props: {
  propertyId: string | null;
  open: boolean;
  onClose?: () => void;
  onEdit?: (id: string) => void;
}) {
  return render(
    <Wrapper>
      <PropertyDetailDrawer
        propertyId={props.propertyId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

describe('PropertyDetailDrawer', () => {
  it('renders drawer with property code in header', () => {
    renderDrawer({ propertyId: 'prop-01', open: true });
    const matches = screen.getAllByText('IMV-001');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows property type chip in header', () => {
    renderDrawer({ propertyId: 'prop-01', open: true });
    const matches = screen.getAllByText('Residential');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ propertyId: 'prop-01', open: true });
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  it('hides edit button when onEdit prop is not provided', () => {
    renderDrawer({ propertyId: 'prop-01', open: true });
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ propertyId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ propertyId: 'prop-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when propertyId is null', () => {
    renderDrawer({ propertyId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Identification')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ propertyId: 'prop-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders geocoding status', () => {
    renderDrawer({ propertyId: 'prop-01', open: true });
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('edit button calls onEdit with property id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ propertyId: 'prop-01', open: true, onEdit });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith('prop-01');
  });

});
