import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import { api } from '@/services/api';
import { BranchSection } from './BranchSection';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

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
  mockGet.mockResolvedValue({ data: {
    data: MOCK_BRANCHES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
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
});
