import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', () => ({}));
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

vi.mock('../hooks/useFinancialEntrySave', () => ({
  useFinancialEntrySave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_ENTRY = {
  id: 'fin-01', entryType: 'TENANT_DEBIT', amount: 150,
  description: 'Inspection fee', relatedEntityName: 'Agency Alpha',
  effectiveAt: '2026-04-01T00:00:00Z', referenceNumber: 'REF-001', notes: 'Some notes',
};

vi.mock('../hooks/useFinancialEntryDetail', () => ({
  useFinancialEntryDetail: (id: string | null) => {
    if (!id) return { entry: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { entry: MOCK_ENTRY, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { FinancialEntryFormDrawer } from './FinancialEntryFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof FinancialEntryFormDrawer>[0]> = {}) {
  return render(
    <FinancialEntryFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      entryId={props.entryId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('FinancialEntryFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('New Entry')).toBeInTheDocument();
    expect(screen.getByText('Create Entry')).toBeInTheDocument();
    expect(screen.getByText('Type & Values')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ entryId: 'fin-01' });
    expect(screen.getByText('Edit Entry')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Inspection fee');
    expect(screen.getByLabelText('Related Entity')).toHaveValue('Agency Alpha');
    expect(screen.getByLabelText('Reference')).toHaveValue('REF-001');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ description: 'Required field' });
    renderDrawer();
    fireEvent.click(screen.getByText('Create Entry'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
