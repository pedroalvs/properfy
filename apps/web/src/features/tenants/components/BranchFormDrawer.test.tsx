import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn().mockResolvedValue({ data: undefined, error: { error: { message: 'Not found' } } }),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { BranchFormDrawer } from './BranchFormDrawer';
import { api } from '@/services/api';

const LEGACY_LIKE_BRANCH = {
  id: 'br-03',
  tenantId: 'ten-01',
  name: 'George St Office',
  address: '123 George St, Sydney NSW 2000, AU',
  addressJson: {
    // No formattedAddress stored: the label must be rebuilt via PR-09's
    // formatAddressLabel, which prepends `number` to the street.
    street: 'George St',
    number: '123',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
  },
  contactEmail: 'george@imob.com',
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

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
  vi.clearAllMocks();
});

describe('BranchFormDrawer', () => {
  it('renders create mode title when no branch', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('New Branch')).toBeInTheDocument();
  });

  it('renders form fields for name, address, contact email', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact Email')).toBeInTheDocument();
  });

  it('renders Create Branch button in create mode', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Create Branch')).toBeInTheDocument();
  });

  it('renders edit mode title when branch is provided', () => {
    const Wrapper = createWrapper();
    const branch = {
      id: 'br-01',
      tenantId: 'ten-01',
      name: 'Centro',
      address: 'Rua Augusta, 100',
      addressJson: {
        formattedAddress: 'Rua Augusta, 100, Sao Paulo SP 01000-000, BR',
        street: 'Rua Augusta, 100',
        suburb: 'Sao Paulo',
        postcode: '01000-000',
        state: 'SP',
        country: 'BR',
        latitude: -23.55,
        longitude: -46.63,
        provider: 'MAPBOX',
      },
      contactEmail: 'centro@imob.com',
      status: 'ACTIVE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" branch={branch} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Edit Branch')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch Street')).toHaveValue('Rua Augusta, 100');
    expect(screen.getByLabelText('Branch State')).toHaveValue('SP');
  });

  it('loads a stored house number into the Number field on edit (O-2)', () => {
    const Wrapper = createWrapper();
    const branch = {
      id: 'br-02',
      tenantId: 'ten-01',
      name: 'Filial Norte',
      address: '123 George St',
      addressJson: {
        formattedAddress: '123 George St, Sydney NSW 2000, AU',
        street: 'George St',
        number: '123',
        suburb: 'Sydney',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        latitude: -33.86,
        longitude: 151.2,
        provider: 'MAPBOX',
      },
      contactEmail: 'norte@imob.com',
      status: 'ACTIVE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" branch={branch} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Branch Number')).toHaveValue('123');
  });

  it('shows the full address label including the house number (C, PR-09 formatAddressLabel)', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" branch={LEGACY_LIKE_BRANCH} onSaved={vi.fn()} />
      </Wrapper>,
    );
    // The top "Address" search field must read "123 George St…", not "George St…".
    expect(screen.getByPlaceholderText('Search verified address')).toHaveValue('123 George St, Sydney NSW 2000, AU');
  });

  it('marks all address fields (incl. Number) and shows the alert on a 422 (B)', async () => {
    (api.PATCH as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: undefined,
      error: {
        error: {
          code: 'ADDRESS_NOT_VERIFIED',
          message: 'The address could not be verified.',
          details: [{ field: 'address', reason: 'COARSE_RESULT' }],
        },
      },
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open onClose={vi.fn()} tenantId="ten-01" branch={LEGACY_LIKE_BRANCH} onSaved={vi.fn()} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    for (const field of ['Branch Street', 'Branch Number', 'Branch Suburb', 'Branch Postcode', 'Branch State']) {
      expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('does not render when open is false', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BranchFormDrawer open={false} onClose={vi.fn()} tenantId="ten-01" onSaved={vi.fn()} />
      </Wrapper>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-full');
  });
});
