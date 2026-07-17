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
import { PropertyImportPage } from './PropertyImportPage';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

function list(items: unknown[]) {
  return { data: { data: items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: 1 } } };
}

const PREVIEW_RESPONSE = {
  importId: 'import-1',
  tenantId: 'tenant-1',
  summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
  rows: [{
    rowNumber: 2, severity: 'ready', importable: true,
    propertyCode: 'PROP-001', type: 'HOUSE', notes: null,
    property: {
      resolution: 'new', propertyId: null, propertyCode: 'PROP-001',
      street: '1 Main St', addressLine2: null, suburb: 'Kogarah', state: 'NSW', postcode: '2217',
      country: 'AU', duplicateOfRow: null, geocode: { status: 'found', lat: -33.9, lng: 151.1 },
    },
    issues: [],
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
      <PropertyImportPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue(list([]));
  setRole('AM');
});

describe('PropertyImportPage', () => {
  it('renders wizard with Upload step initially', () => {
    renderPage();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('shows page title "Import Properties" and the back link', () => {
    renderPage();
    expect(screen.getByText('Import Properties')).toBeInTheDocument();
    expect(screen.getByText('Back to Properties').closest('a')).toHaveAttribute('href', '/properties');
  });

  it('has template download link pointing to the csv file', () => {
    renderPage();
    const downloadLink = screen.getByRole('link', { name: /download template/i });
    expect(downloadLink).toHaveAttribute('href', '/templates/properties-import-template.csv');
    expect(downloadLink).toHaveAttribute('download', 'properties-import-template.csv');
  });

  it('AM sees an Agency selector', () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
  });

  it('CL_ADMIN sees no Agency selector', () => {
    setRole('CL_ADMIN', 'tenant-1');
    renderPage();
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });

  it('keeps Next disabled for AM until agency and file are selected', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/tenants') return list([{ id: 'tenant-1', name: 'Agency One' }]);
      return list([]);
    });
    renderPage();

    expect(screen.getByText('Next')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency One'));
    expect(screen.getByText('Next')).toBeDisabled(); // still no file

    const file = new File(['data'], 'props.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
  });

  it('previews the file server-side and shows resolved rows with the geocode badge', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockPost.mockResolvedValue({ data: { data: PREVIEW_RESPONSE } });
    renderPage();

    const file = new File(['data'], 'props.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    expect(screen.getByText(/New property/i)).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/properties/import/preview',
      expect.objectContaining({ body: expect.any(FormData) }),
    );
    // CL_ADMIN never sends tenantId — the backend scopes by JWT.
    const formData = mockPost.mock.calls[0]![1].body as FormData;
    expect(formData.get('tenantId')).toBeNull();
  });

  it('shows a retryable error state when the preview call fails', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockPost.mockResolvedValue({ error: { code: 'VALIDATION_ERROR', message: 'Unreadable file' } });
    renderPage();

    const file = new File(['data'], 'props.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('commits directly when the preview has no errors', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockPost.mockImplementation((path: string) => {
      if (path === '/v1/properties/import/preview') return Promise.resolve({ data: { data: PREVIEW_RESPONSE } });
      return Promise.resolve({ data: { data: { importId: 'import-1', status: 'PROCESSING' } } });
    });
    renderPage();

    const file = new File(['data'], 'props.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Start Import')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/v1/properties/import/{importId}/commit',
      expect.objectContaining({ body: expect.objectContaining({ skipInvalidRows: false }) }),
    ));
  });

  it('asks to import valid rows only when the preview has errors, then commits with skipInvalidRows', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    const previewWithErrors = {
      ...PREVIEW_RESPONSE,
      summary: { totalRows: 2, importable: 1, withWarnings: 0, withErrors: 1 },
      rows: [
        ...PREVIEW_RESPONSE.rows,
        {
          ...PREVIEW_RESPONSE.rows[0], rowNumber: 3, severity: 'error', importable: false, property: null,
          issues: [{ field: 'street', code: 'PROPERTY_STREET_REQUIRED', severity: 'error', message: 'Street is required' }],
        },
      ],
    };
    mockPost.mockImplementation((path: string) => {
      if (path === '/v1/properties/import/preview') return Promise.resolve({ data: { data: previewWithErrors } });
      return Promise.resolve({ data: { data: { importId: 'import-1', status: 'PROCESSING' } } });
    });
    renderPage();

    const file = new File(['data'], 'props.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Start Import'));
    expect(await screen.findByText(/import only the valid/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
      '/v1/properties/import/{importId}/commit',
      expect.objectContaining({ body: expect.objectContaining({ skipInvalidRows: true }) }),
    ));
  });

  it('downloads errors.csv through the shared API client once the import completes with errors', async () => {
    setRole('CL_ADMIN', 'tenant-1');
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/properties/import/{importId}/errors.csv') {
        return Promise.resolve({ data: new Blob(['row,message\n3,boom'], { type: 'text/csv' }) });
      }
      return Promise.resolve({
        data: {
          data: {
            id: 'import-1', status: 'COMPLETED',
            totalRows: 1, successCount: 0, errorCount: 1, resultsJson: [{ rowNumber: 2, status: 'error', message: 'boom' }],
          },
        },
      });
    });
    mockPost.mockImplementation((path: string) => {
      if (path === '/v1/properties/import/preview') return Promise.resolve({ data: { data: PREVIEW_RESPONSE } });
      return Promise.resolve({ data: { data: { importId: 'import-1', status: 'PROCESSING' } } });
    });
    renderPage();

    const file = new File(['data'], 'props.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Start Import'));

    const downloadButton = await screen.findByText('Download errors.csv');
    fireEvent.click(downloadButton);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(
      '/v1/properties/import/{importId}/errors.csv',
      expect.objectContaining({ params: { path: { importId: 'import-1' } } }),
    ));
  });
});
