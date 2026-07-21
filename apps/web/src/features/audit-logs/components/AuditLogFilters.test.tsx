import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditLogFilters } from './AuditLogFilters';
import { DEFAULT_FILTERS } from '../types';

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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('AuditLogFilters', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: { role: 'AM', tenantId: undefined } });
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: [{ id: 'user-1', name: 'Jamie Ops' }],
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      },
    });
  });

  it('renders actor dropdown', () => {
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Actor')).toBeInTheDocument();
  });

  it('lets the operator pick an actor by name', async () => {
    const onFiltersChange = vi.fn();
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByLabelText('Actor'));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Jamie Ops' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: 'Jamie Ops' }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1' }),
    );
  });

  it('loads agency users as actors for a tenant-scoped operator', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'CL_ADMIN', tenantId: 'tenant-9' } });
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/tenants/tenant-9/users', expect.anything());
    });
  });

  it('renders entity type select', () => {
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Entity Type')).toBeInTheDocument();
  });

  it('renders entity id input', () => {
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Entity ID')).toBeInTheDocument();
  });

  it('renders action select', () => {
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Action')).toBeInTheDocument();
  });

  it('renders date range filters', () => {
    renderWithProviders(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Date - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Date - end')).toBeInTheDocument();
  });
});
