import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorStatus } from '@properfy/shared';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { InspectorDetailSections } from './InspectorDetailSections';
import type { InspectorDetail } from '../types';
import { api } from '@/services/api';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn().mockResolvedValue({ data: { data: [], pagination: { total: 0, page: 1, pageSize: 1 } }, error: null }),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function makeInspector(overrides: Partial<InspectorDetail> = {}): InspectorDetail {
  return {
    id: 'insp-01',
    name: 'Carlos Silva',
    email: 'carlos@inspecoes.com',
    phone: '11999999999',
    status: InspectorStatus.ACTIVE,
    regionsCount: 3,
    serviceTypesCount: 5,
    ratingAvg: 4.8,
    ratingCount: 12,
    completedCount: 245,
    regionIds: ['region-1', 'region-2', 'region-3'],
    serviceTypes: [
      { serviceTypeId: '123e4567-e89b-12d3-a456-426614174000', certified: false },
      { serviceTypeId: '123e4567-e89b-12d3-a456-426614174001', certified: false },
    ],
    blockedClients: [],
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('InspectorDetailSections', () => {
  // Fresh QueryClient per test — a shared client across tests lets one test's
  // cached query results (same keys: 'service-types'/'service-regions'/'tenants'
  // 'inspector-detail') leak into the next, instead of each test observing
  // only the responses it mocked.
  let wrapper: ReturnType<typeof createQueryWrapper>;
  const mockGet = api.GET as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    wrapper = createQueryWrapper();
    mockGet.mockReset();
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/service-types') {
        return Promise.resolve({
          data: {
            data: [
              { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Vistoria de Entrada' },
              { id: '123e4567-e89b-12d3-a456-426614174001', name: 'Vistoria de Saída' },
            ],
            pagination: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
          },
          error: null,
        });
      }

      if (path === '/v1/service-regions') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'region-1', name: 'Zona Norte' },
              { id: 'region-2', name: 'Zona Sul' },
              { id: 'region-3', name: 'Centro' },
            ],
            pagination: { total: 3, page: 1, pageSize: 100, totalPages: 1 },
          },
          error: null,
        });
      }

      if (path === '/v1/tenants') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'ten-01', name: 'Imobiliaria Alpha' },
              { id: 'ten-02', name: 'Imobiliaria Beta' },
            ],
            pagination: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
          },
          error: null,
        });
      }

      return Promise.resolve({
        data: { data: [], pagination: { total: 0, page: 1, pageSize: 1, totalPages: 0 } },
        error: null,
      });
    });
  });

  it('renders section titles', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />, { wrapper });
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
    expect(screen.getByText('Insurance & Police Check')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('renders name and email', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />, { wrapper });
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
  });

  it('shows phone when present, em-dash when null', () => {
    const { rerender } = render(
      <InspectorDetailSections inspector={makeInspector({ phone: '11999999999' })} />,
      { wrapper },
    );
    expect(screen.getByText('11999999999')).toBeInTheDocument();

    rerender(<InspectorDetailSections inspector={makeInspector({ phone: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows regions list', async () => {
    render(<InspectorDetailSections inspector={makeInspector()} />, { wrapper });
    expect(await screen.findByText('Zona Norte, Zona Sul, Centro')).toBeInTheDocument();
  });

  it('shows service types list', async () => {
    render(<InspectorDetailSections inspector={makeInspector()} />, { wrapper });
    expect(await screen.findByText('Vistoria de Entrada, Vistoria de Saída')).toBeInTheDocument();
  });

  it('shows profile fields (full name, ABN, DOB) when present', () => {
    render(
      <InspectorDetailSections inspector={makeInspector({
        fullName: 'Carlos Alberto Silva',
        abn: '12345678901',
        dateOfBirth: '1990-05-15',
      })} />,
      { wrapper },
    );
    expect(screen.getByText('Carlos Alberto Silva')).toBeInTheDocument();
    expect(screen.getByText('12345678901')).toBeInTheDocument();
    expect(screen.getByText('15/05/1990')).toBeInTheDocument();
  });

  it('shows a generic document label (never the raw storage key) when metaJson has no fileName', () => {
    render(
      <InspectorDetailSections inspector={makeInspector({
        insuranceFileKey: 'uploads/insurance-cert.pdf',
        insuranceExpiresAt: '2027-06-30',
        policeCheckFileKey: 'uploads/police-check.pdf',
        policeCheckExpiresAt: '2027-12-31',
      })} />,
      { wrapper },
    );
    expect(screen.getByText('Insurance document')).toBeInTheDocument();
    expect(screen.getByText('30/06/2027')).toBeInTheDocument();
    expect(screen.getByText('Police check document')).toBeInTheDocument();
    expect(screen.getByText('31/12/2027')).toBeInTheDocument();
    expect(screen.queryByText('uploads/insurance-cert.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('uploads/police-check.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText(/uploads\//)).not.toBeInTheDocument();
  });

  it('shows the fileName from metaJson when present, not the generic label', () => {
    render(
      <InspectorDetailSections inspector={makeInspector({
        insuranceFileKey: 'uploads/insurance-cert.pdf',
        insuranceMetaJson: { fileName: 'certificate-2027.pdf', uploadedAt: '2026-01-01T00:00:00Z' },
      })} />,
      { wrapper },
    );
    expect(screen.getByText('certificate-2027.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Insurance document')).not.toBeInTheDocument();
  });

  it('shows blocked tenants when present', async () => {
    render(
      <InspectorDetailSections inspector={makeInspector({ blockedClients: ['ten-01'] })} />,
      { wrapper },
    );
    expect(await screen.findByText('Imobiliaria Alpha')).toBeInTheDocument();
  });

  it('resolves a region name beyond the first page instead of leaking the raw UUID', async () => {
    const PAGE_SIZE = 100;
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `region-${i}`, name: `Region ${i}` }));
    const targetId = '99999999-9999-9999-9999-999999999999';
    const page2 = [{ id: targetId, name: 'Beyond Page One' }];

    mockGet.mockImplementation((path: string, opts?: { params?: { query?: { page?: string } } }) => {
      if (path === '/v1/service-regions') {
        const page = Number(opts?.params?.query?.page ?? '1');
        const data = page === 1 ? page1 : page === 2 ? page2 : [];
        return Promise.resolve({
          data: { data, pagination: { total: PAGE_SIZE + 1, page, pageSize: PAGE_SIZE, totalPages: 2 } },
          error: null,
        });
      }
      return Promise.resolve({
        data: { data: [], pagination: { total: 0, page: 1, pageSize: 1, totalPages: 0 } },
        error: null,
      });
    });

    render(
      <InspectorDetailSections inspector={makeInspector({ regionIds: [targetId] })} />,
      { wrapper },
    );

    expect(await screen.findByText('Beyond Page One')).toBeInTheDocument();
    expect(screen.queryByText(targetId)).not.toBeInTheDocument();
  });

  it('renders "Unknown" (never the raw id) when a referenced region truly does not exist', async () => {
    const missingId = '11111111-1111-1111-1111-111111111111';
    render(
      <InspectorDetailSections inspector={makeInspector({ regionIds: [missingId] })} />,
      { wrapper },
    );

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText(missingId)).not.toBeInTheDocument();
  });
});
