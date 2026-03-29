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
    regions: ['Zona Norte', 'Zona Sul', 'Centro'],
    serviceTypes: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    clientEligibility: [],
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('InspectorDetailSections', () => {
  const wrapper = createQueryWrapper();
  const mockGet = api.GET as ReturnType<typeof vi.fn>;

  beforeEach(() => {
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

  it('shows regions list', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />, { wrapper });
    expect(screen.getByText('Zona Norte, Zona Sul, Centro')).toBeInTheDocument();
  });

  it('shows service types list', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />, { wrapper });
    expect(screen.getByText('Vistoria de Entrada, Vistoria de Saída')).toBeInTheDocument();
  });

  it('shows client eligibility when tenants are assigned', () => {
    render(
      <InspectorDetailSections inspector={makeInspector({ clientEligibility: ['ten-01', 'ten-02'] })} />,
      { wrapper },
    );
    expect(screen.getByText('Imobiliaria Alpha, Imobiliaria Beta')).toBeInTheDocument();
  });
});
