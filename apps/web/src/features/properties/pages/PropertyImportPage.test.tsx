import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

import { PropertyImportPage } from './PropertyImportPage';

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

describe('PropertyImportPage', () => {
  it('renders wizard with Upload step initially', () => {
    renderPage();

    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('Drag and drop your file here')).toBeInTheDocument();
  });

  it('shows page title "Import Properties"', () => {
    renderPage();

    expect(screen.getByText('Import Properties')).toBeInTheDocument();
  });

  it('has back link to properties list', () => {
    renderPage();

    const backLink = screen.getByText('Back to Properties');
    expect(backLink).toBeInTheDocument();
    expect(backLink.closest('a')).toHaveAttribute('href', '/properties');
  });

  it('shows expected columns information', () => {
    renderPage();

    expect(
      screen.getByText(/branchName, propertyCode, type/),
    ).toBeInTheDocument();
  });

  it('shows Next button disabled when no file is selected', () => {
    renderPage();

    const nextBtn = screen.getByText('Next');
    expect(nextBtn).toBeDisabled();
  });

  it('has template download link pointing to csv file (FR-019c)', () => {
    renderPage();

    const downloadLink = screen.getByRole('link', { name: /download template/i });
    expect(downloadLink).toHaveAttribute('href', '/templates/properties-import-template.csv');
    expect(downloadLink).toHaveAttribute('download', 'properties-import-template.csv');
  });
});
