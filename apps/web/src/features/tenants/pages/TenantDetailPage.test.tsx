import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

import { api } from '@/services/api';
import { TenantDetailPage } from './TenantDetailPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

const MOCK_TENANT = {
  id: 'ten-01',
  name: 'Imob Alpha',
  legalName: 'Alpha LTDA',
  status: 'ACTIVE',
  branchCount: 3,
  timezone: 'America/Sao_Paulo',
  currency: 'AUD',
  settingsJson: {},
  notes: 'Some notes',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

const MOCK_INACTIVE_TENANT = {
  ...MOCK_TENANT,
  status: 'INACTIVE',
};

const MOCK_BRANCHES = {
  data: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={['/tenants/ten-01']}>
            <Routes>
              <Route path="/tenants/:tenantId" element={children} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockUseAuth.mockReturnValue({ user: { id: 'u1', role: 'AM' } });
  mockGet.mockImplementation((path: string) => {
    if (path.includes('/branches')) {
      return Promise.resolve({ data: MOCK_BRANCHES });
    }
    return Promise.resolve({ data: { data: MOCK_TENANT } });
  });
  mockPost.mockResolvedValue({ data: { data: {} } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><TenantDetailPage /></Wrapper>);
}

describe('TenantDetailPage', () => {
  it('renders tenant name as page header', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Imob Alpha').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders tenant status chip', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Overview and Branches tabs', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Branches' })).toBeInTheDocument();
  });

  it('renders the Email Logo tab and shows the section when selected', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Email Logo' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Email Logo' }));
    await waitFor(() => {
      expect(screen.getByText('No logo uploaded yet.')).toBeInTheDocument();
    });
  });

  it('renders tenant detail rows in overview tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Timezone').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('America/Sao_Paulo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('AUD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Some notes').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Edit button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('shows empty state when tenant is not found', async () => {
    // A successful response whose envelope carries no tenant → tenant is
    // undefined WITHOUT isError (distinct from the recoverable-error path).
    mockGet.mockImplementation((path: string) => {
      if (path.includes('/branches')) {
        return Promise.resolve({ data: MOCK_BRANCHES });
      }
      return Promise.resolve({ data: { data: null }, error: undefined });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Agency not found')).toBeInTheDocument();
    });
  });

  it('shows a recoverable error state and retries on click', async () => {
    let detailCalls = 0;
    mockGet.mockImplementation((path: string) => {
      if (path.includes('/branches')) {
        return Promise.resolve({ data: MOCK_BRANCHES });
      }
      detailCalls += 1;
      return Promise.resolve({ data: undefined, error: { message: 'Network error' } });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
    expect(screen.queryByText('Agency not found')).not.toBeInTheDocument();

    const callsBeforeRetry = detailCalls;
    fireEvent.click(screen.getByText('Try again'));

    await waitFor(() => {
      expect(detailCalls).toBeGreaterThan(callsBeforeRetry);
    });
  });

  it('opens the deactivate dialog and confirms deactivation for an active agency', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Imob Alpha').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getAllByText('Deactivate')[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Agency' });
    fireEvent.change(within(dialog).getByLabelText('Deactivation reason'), {
      target: { value: 'No longer active' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/tenants/ten-01/deactivate',
        { body: { reason: 'No longer active' } },
      );
    });
  });

  it('opens the activate dialog and confirms activation for an inactive agency', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path.includes('/branches')) {
        return Promise.resolve({ data: MOCK_BRANCHES });
      }
      return Promise.resolve({ data: { data: MOCK_INACTIVE_TENANT } });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Imob Alpha').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getAllByText('Activate')[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Activate Agency' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/v1/tenants/ten-01/activate', { body: {} });
    });
  });

  it('hides Activate/Deactivate actions for CL_ADMIN', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', role: 'CL_ADMIN' } });
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Imob Alpha').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryAllByText('Deactivate')).toHaveLength(0);
    expect(screen.queryAllByText('Activate')).toHaveLength(0);
  });

  it('shows Activate/Deactivate actions for OP', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', role: 'OP' } });
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Deactivate').length).toBeGreaterThanOrEqual(1);
    });
  });
});
