import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyType, GeocodingStatus } from '@properfy/shared';
import { PropertyTable } from './PropertyTable';
import type { Property } from '../types';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchName: 'Filial Centro',
    propertyCode: 'IMV-001',
    type: PropertyType.RESIDENTIAL,
    street: 'Rua das Flores, 123',
    addressLine2: null,
    suburb: 'Centro',
    postcode: '01001-000',
    state: 'SP',
    country: 'BR',
    geocodingStatus: GeocodingStatus.SUCCESS,
    notes: null,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    ...overrides,
  };
}

describe('PropertyTable', () => {
  it('renders column headers', () => {
    render(<PropertyTable data={[]} />);
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.getByText('Tipo')).toBeInTheDocument();
    expect(screen.getByText('Endereço')).toBeInTheDocument();
    expect(screen.getByText('CEP')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getByText('Filial')).toBeInTheDocument();
  });

  it('renders property data (code, composite address, state)', () => {
    const prop = makeProperty();
    render(<PropertyTable data={[prop]} />);
    expect(screen.getByText('IMV-001')).toBeInTheDocument();
    expect(screen.getByText('Rua das Flores, 123, Centro')).toBeInTheDocument();
    expect(screen.getByText('SP')).toBeInTheDocument();
  });

  it('renders PropertyTypeChip for type', () => {
    const prop = makeProperty({ type: PropertyType.COMMERCIAL });
    render(<PropertyTable data={[prop]} />);
    expect(screen.getByText('Comercial')).toBeInTheDocument();
  });

  it('renders em dash for null branchName', () => {
    const prop = makeProperty({ branchId: null, branchName: null });
    render(<PropertyTable data={[prop]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<PropertyTable data={[]} loading />);
    expect(screen.getByText('Código')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<PropertyTable data={[]} />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<PropertyTable data={[]} error="Erro de rede" />);
    expect(screen.getByText('Erro de rede')).toBeInTheDocument();
  });

  it('view action calls onView with correct property', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const prop = makeProperty();
    render(<PropertyTable data={[prop]} onView={onView} />);
    await user.click(screen.getByLabelText('Visualizar'));
    expect(onView).toHaveBeenCalledWith(prop);
  });

  it('edit action calls onEdit with correct property', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const prop = makeProperty();
    render(<PropertyTable data={[prop]} onEdit={onEdit} />);
    await user.click(screen.getByLabelText('Editar'));
    expect(onEdit).toHaveBeenCalledWith(prop);
  });
});
