import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));
vi.mock('@/services/api', () => ({
  api: {
    GET: mockApiGet,
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
    use: vi.fn(),
  },
}));

import { PropertySearch } from './PropertySearch';

const mockProperties = [
  {
    id: 'prop-1',
    tenantId: 't-1',
    branchId: 'b-1',
    branchName: 'Downtown Branch',
    propertyCode: 'P001',
    type: 'APARTMENT',
    street: '123 Main St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    geocodingStatus: 'COMPLETED',
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'prop-2',
    tenantId: 't-1',
    branchId: 'b-2',
    branchName: null,
    propertyCode: 'P002',
    type: 'HOUSE',
    street: '456 Oak Ave',
    addressLine2: null,
    suburb: 'Melbourne',
    postcode: '3000',
    state: 'VIC',
    country: 'AU',
    geocodingStatus: 'PENDING',
    notes: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('PropertySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiGet.mockResolvedValue({
      data: {
        data: mockProperties,
        pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
      },
      error: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with default label', () => {
    render(<PropertySearch value="" onChange={vi.fn()} />, { wrapper: createWrapper() });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByLabelText('Property')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<PropertySearch value="" onChange={vi.fn()} label="Select Property" />, { wrapper: createWrapper() });
    expect(screen.getByLabelText('Select Property')).toBeInTheDocument();
  });

  it('shows minimum character message when typing less than 3 chars', async () => {
    render(<PropertySearch value="" onChange={vi.fn()} />, { wrapper: createWrapper() });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByText('Type at least 3 characters to search')).toBeInTheDocument();
  });

  it('searches after debounce and shows results', async () => {
    render(<PropertySearch value="" onChange={vi.fn()} />, { wrapper: createWrapper() });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Main' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('123 Main St, Sydney 2000')).toBeInTheDocument();
    });
    expect(screen.getByText(/Apartment/)).toBeInTheDocument();
    expect(screen.getByText(/Downtown Branch/)).toBeInTheDocument();
  });

  it('calls onChange with property id on selection', async () => {
    const onChange = vi.fn();
    render(<PropertySearch value="" onChange={onChange} />, { wrapper: createWrapper() });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Main' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('123 Main St, Sydney 2000')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('123 Main St, Sydney 2000'));
    expect(onChange).toHaveBeenCalledWith('prop-1');
  });

  it('shows clear button when value is set', async () => {
    const onChange = vi.fn();
    render(<PropertySearch value="prop-1" onChange={onChange} />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes dropdown on outside click', async () => {
    render(<PropertySearch value="" onChange={vi.fn()} />, { wrapper: createWrapper() });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
