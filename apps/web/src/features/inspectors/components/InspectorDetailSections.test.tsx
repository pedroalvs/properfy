import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorStatus } from '@properfy/shared';
import { InspectorDetailSections } from './InspectorDetailSections';
import type { InspectorDetail } from '../types';

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
  it('renders section titles', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />);
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    expect(screen.getByText('Atuação')).toBeInTheDocument();
    expect(screen.getByText('Registro')).toBeInTheDocument();
  });

  it('renders name and email', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />);
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
  });

  it('shows phone when present, em-dash when null', () => {
    const { rerender } = render(
      <InspectorDetailSections inspector={makeInspector({ phone: '11999999999' })} />,
    );
    expect(screen.getByText('11999999999')).toBeInTheDocument();

    rerender(<InspectorDetailSections inspector={makeInspector({ phone: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows document (CPF) when present, em-dash when null', () => {
    const { rerender } = render(
      <InspectorDetailSections inspector={makeInspector({ document: '123.456.789-00' })} />,
    );
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();

    rerender(<InspectorDetailSections inspector={makeInspector({ document: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows regions list', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />);
    expect(screen.getByText('Zona Norte, Zona Sul, Centro')).toBeInTheDocument();
  });

  it('shows service types list', () => {
    render(<InspectorDetailSections inspector={makeInspector()} />);
    expect(screen.getByText('Vistoria de Entrada, Vistoria de Saída')).toBeInTheDocument();
  });

  it('shows rating when present, em-dash when null', () => {
    const { rerender } = render(
      <InspectorDetailSections inspector={makeInspector({ rating: 4.8 })} />,
    );
    expect(screen.getByText('4.8 / 5.0')).toBeInTheDocument();

    rerender(<InspectorDetailSections inspector={makeInspector({ rating: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
