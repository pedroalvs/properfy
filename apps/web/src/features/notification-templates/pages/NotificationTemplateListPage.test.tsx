import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(() => ({ role: null, hasRole: () => false, canPerform: () => false })),
}));

import { api } from '@/services/api';
import { usePermissions } from '@/hooks/usePermissions';
import { NotificationTemplateListPage } from './NotificationTemplateListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

const MOCK_TEMPLATES = [
  {
    id: 'tpl-01',
    tenantId: null,
    code: 'INSPECTION_NOTICE',
    channel: 'EMAIL',
    subject: 'Inspection Scheduled',
    body: 'Hello {{tenant_name}}',
    active: true,
    requiredVariables: ['tenant_name'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tpl-02',
    tenantId: 'tenant-1',
    rentalTenantName: 'Acme Realty',
    code: 'REMINDER_7D',
    channel: 'SMS',
    subject: '',
    body: 'Reminder: {{scheduled_date}}',
    active: false,
    requiredVariables: ['scheduled_date'],
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter>{children}</MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_TEMPLATES,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
  // Default: non cross-tenant role → agency filter hidden.
  mockUsePermissions.mockReturnValue({ role: null, hasRole: () => false, canPerform: () => false });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><NotificationTemplateListPage /></Wrapper>);
}

describe('NotificationTemplateListPage', () => {
  it('renders page title "Notification Templates"', () => {
    renderPage();
    expect(screen.getByText('Notification Templates')).toBeInTheDocument();
  });

  it('renders the "Create custom template" CTA', () => {
    renderPage();
    expect(screen.getByText('Create custom template')).toBeInTheDocument();
  });

  it('does not render the create drawer until the CTA is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText('Create Custom Template')).not.toBeInTheDocument();

    await user.click(screen.getByText('Create custom template'));
    expect(await screen.findByText('Create Custom Template')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Template type' })).toBeInTheDocument();
  });

  it('renders filter bar with contract-backed controls only', () => {
    renderPage();
    expect(screen.getByLabelText('Template Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Channel')).toBeInTheDocument();
    expect(screen.getByLabelText('Include Platform Defaults')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('renders data table with template data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Inspection Notice')).toBeInTheDocument();
    });
    // REMINDER_7D is not a known code → falls back to the raw code string.
    expect(screen.getByText('REMINDER_7D')).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    renderPage();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getAllByText('Channel').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Subject').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the Agency filter for cross-tenant roles (AM/OP)', () => {
    mockUsePermissions.mockReturnValue({
      role: 'AM',
      hasRole: (...roles: string[]) => roles.includes('AM'),
      canPerform: () => true,
    });
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
  });

  it('hides the Agency filter for non cross-tenant roles', () => {
    mockUsePermissions.mockReturnValue({
      role: 'CL_ADMIN',
      hasRole: (...roles: string[]) => roles.includes('CL_ADMIN'),
      canPerform: () => false,
    });
    renderPage();
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });
});
