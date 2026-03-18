import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorStatus } from '@properfy/shared';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { InspectorDetailSections } from './InspectorDetailSections';
import type { InspectorDetail } from '../types';

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
    serviceTypes: ['Vistoria de Entrada', 'Vistoria de Saída'],
    document: '123.456.789-00',
    rating: 4.8,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('InspectorDetailSections', () => {
  const wrapper = createQueryWrapper();

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

  it('shows document (CPF) when present, em-dash when null', () => {
    const { rerender } = render(
      <InspectorDetailSections inspector={makeInspector({ document: '123.456.789-00' })} />,
      { wrapper },
    );
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();

    rerender(<InspectorDetailSections inspector={makeInspector({ document: null })} />);
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

  it('shows rating when present, em-dash when null', () => {
    const { rerender } = render(
      <InspectorDetailSections inspector={makeInspector({ rating: 4.8 })} />,
      { wrapper },
    );
    expect(screen.getByText('4.8 / 5.0')).toBeInTheDocument();

    rerender(<InspectorDetailSections inspector={makeInspector({ rating: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
