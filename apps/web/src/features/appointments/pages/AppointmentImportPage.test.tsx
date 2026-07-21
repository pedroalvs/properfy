import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(() => ({
    user: { id: 'usr-1', name: 'Admin', email: 'admin@test.com', role: 'AM', tenantId: null },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })),
}));

import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { AppointmentImportPage } from './AppointmentImportPage';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

function list(items: unknown[]) {
  return { data: { data: items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: 1 } } };
}

const PREVIEW_RESPONSE = {
  importId: 'import-1',
  branchId: 'branch-9',
  tenantId: 'tenant-1',
  summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
  rows: [{
    rowNumber: 2, severity: 'ready', importable: true,
    serviceTypeName: 'Routine Inspection', serviceTypeId: 'st-1',
    scheduledDate: '2027-06-20', scheduledDateDefaulted: false,
    timeSlotStart: '09:00', timeSlotEnd: '10:00', timeDefaulted: false, notes: null,
    property: {
      resolution: 'existing', propertyId: 'prop-1', propertyCode: 'PROP-001',
      street: '1 Main St', addressLine2: null, apartmentNumber: '4B', suburb: 'Kogarah', state: 'NSW', postcode: '2217',
      country: 'AU', duplicateOfRow: null,
    },
    contact: {
      resolution: 'new', contactId: null, displayName: 'Jane Smith',
      primaryEmail: 'jane@example.com', primaryPhone: '0412345678',
      additionalChannels: [], channelsDropped: false,
    },
    customFields: [], customFieldsTruncated: false, issues: [],
  }],
};

function setRole(role: 'AM' | 'OP' | 'CL_ADMIN', tenantId: string | null = null) {
  mockUseAuth.mockReturnValue({
    user: { id: 'usr-1', name: 'Test User', email: 'test@test.com', role, tenantId },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
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

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <AppointmentImportPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue(list([]));
  setRole('AM');
});

describe('AppointmentImportPage', () => {
  it('renders wizard with Upload step initially', () => {
    renderPage();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('shows page title "Import Appointments"', () => {
    renderPage();
    expect(screen.getByText('Import Appointments')).toBeInTheDocument();
  });

  it('has back link to appointments list', () => {
    renderPage();
    const backLink = screen.getByText('Back to Appointments');
    expect(backLink.closest('a')).toHaveAttribute('href', '/appointments');
  });

  it('has template download link pointing to the csv file', () => {
    renderPage();
    const downloadLink = screen.getByRole('link', { name: /download template/i });
    expect(downloadLink).toHaveAttribute('href', '/templates/appointments-import-template.csv');
    expect(downloadLink).toHaveAttribute('download', 'appointments-import-template.csv');
  });

  it('AM sees an Agency selector and a Branch selector', () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
  });

  it('CL_ADMIN sees only a Branch selector, no Agency selector', () => {
    setRole('CL_ADMIN', 'tenant-1');
    renderPage();
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
  });

  it('keeps Next disabled for AM until agency, branch and file are all selected', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/tenants') return list([{ id: 'tenant-1', name: 'Agency One' }]);
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    renderPage();

    expect(screen.getByText('Next')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency One'));
    expect(screen.getByText('Next')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    expect(screen.getByText('Next')).toBeDisabled(); // still no file selected

    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
  });

  it('removes the staged file and disables Next again when the remove button is clicked', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    expect(screen.getByText('import.csv')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(screen.queryByText('import.csv')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('resets the branch selection when the agency changes', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/tenants') return list([{ id: 'tenant-1', name: 'Agency One' }, { id: 'tenant-2', name: 'Agency Two' }]);
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    expect(screen.getByLabelText('Branch')).toHaveTextContent('Branch Nine');

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency Two'));

    expect(screen.getByLabelText('Branch')).not.toHaveTextContent('Branch Nine');
  });

  it('previews the file and shows the resolved rows on success', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
    renderPage();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    expect(screen.getByText('1 Main St, Apt 4B, Kogarah, NSW, 2217')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/appointments/import/preview',
      expect.objectContaining({ body: expect.any(FormData) }),
    );
  });

  it('shows a retryable error state when the preview call fails', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    mockPost.mockResolvedValue({ error: { code: 'VALIDATION_ERROR', message: 'Unreadable file' } });
    renderPage();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('commits directly (no confirm dialog) when the preview has no errors', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    mockPost.mockImplementation((path: string) => {
      if (path === '/v1/appointments/import/preview') return Promise.resolve({ data: { data: PREVIEW_RESPONSE } });
      return Promise.resolve({ data: { data: { importId: 'import-1', status: 'PROCESSING' } } });
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Start Import')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/v1/appointments/import/{importId}/commit',
      expect.objectContaining({ body: expect.objectContaining({ skipInvalidRows: false }) }),
    ));

    // Sydney-only platform: no client timezone travels with either call —
    // date-defaulting and the past-date check run in Australia/Sydney server-side.
    const previewCall = mockPost.mock.calls.find((c) => c[0] === '/v1/appointments/import/preview')!;
    const previewFormData = previewCall[1].body;
    expect(previewFormData.get('actorTimezone')).toBeNull();
    const commitCall = mockPost.mock.calls.find((c) => c[0] === '/v1/appointments/import/{importId}/commit')!;
    expect(commitCall[1].body.actorTimezone).toBeUndefined();
  });

  it('asks to import valid rows only when the preview has errors, then commits with skipInvalidRows', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });
    const previewWithErrors = {
      ...PREVIEW_RESPONSE,
      summary: { totalRows: 2, importable: 1, withWarnings: 0, withErrors: 1 },
      rows: [
        ...PREVIEW_RESPONSE.rows,
        {
          ...PREVIEW_RESPONSE.rows[0], rowNumber: 3, severity: 'error', importable: false,
          issues: [{ field: 'serviceType', code: 'SERVICE_TYPE_NOT_FOUND', severity: 'error', message: 'No service type named "Bogus"' }],
        },
      ],
    };
    mockPost.mockImplementation((path: string) => {
      if (path === '/v1/appointments/import/preview') return Promise.resolve({ data: { data: previewWithErrors } });
      return Promise.resolve({ data: { data: { importId: 'import-1', status: 'PROCESSING' } } });
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Start Import'));
    expect(await screen.findByText(/import only the valid/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/v1/appointments/import/{importId}/commit',
      expect.objectContaining({ body: expect.objectContaining({ skipInvalidRows: true }) }),
    ));
  });
});

describe('AppointmentImportPage — errors.csv download', () => {
  it('downloads errors.csv through the shared API client once the import completes with errors', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      if (path === '/v1/appointments/import/{importId}/errors.csv') {
        return Promise.resolve({ data: new Blob(['row,message\n3,boom'], { type: 'text/csv' }) });
      }
      return Promise.resolve({
        data: {
          data: {
            id: 'import-1', branchId: 'branch-9', status: 'COMPLETED',
            totalRows: 1, successCount: 0, errorCount: 1, resultsJson: [{ rowNumber: 2, status: 'error', message: 'boom' }],
          },
        },
      });
    });
    mockPost.mockImplementation((path: string) => {
      if (path === '/v1/appointments/import/preview') return Promise.resolve({ data: { data: PREVIEW_RESPONSE } });
      return Promise.resolve({ data: { data: { importId: 'import-1', status: 'PROCESSING' } } });
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));
    const file = new File(['data'], 'import.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start Import'));

    const downloadButton = await screen.findByText('Download errors.csv');
    fireEvent.click(downloadButton);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(
      '/v1/appointments/import/{importId}/errors.csv',
      expect.objectContaining({ params: { path: { importId: 'import-1' } } }),
    ));
  });
});
