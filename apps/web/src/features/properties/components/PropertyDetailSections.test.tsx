import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertyType, GeocodingStatus } from '@properfy/shared';
import { PropertyDetailSections } from './PropertyDetailSections';
import type { PropertyDetail } from '../types';

function makeProperty(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 'prop-01',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchName: 'Filial Centro',
    propertyCode: 'IMV-001',
    type: PropertyType.RESIDENTIAL,
    street: 'Rua das Flores, 123',
    addressLine2: 'Apto 42',
    suburb: 'Centro',
    postcode: '01001-000',
    state: 'SP',
    country: 'BR',
    geocodingStatus: GeocodingStatus.SUCCESS,
    notes: 'Test note',
    latitude: -23.5505,
    longitude: -46.6333,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('PropertyDetailSections', () => {
  it('renders section titles', () => {
    render(<PropertyDetailSections property={makeProperty()} />);
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Geocoding')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('renders property code and type chip', () => {
    render(<PropertyDetailSections property={makeProperty()} />);
    expect(screen.getByText('IMV-001')).toBeInTheDocument();
    expect(screen.getByText('Residential')).toBeInTheDocument();
  });

  it('renders address fields', () => {
    render(<PropertyDetailSections property={makeProperty()} />);
    expect(screen.getByText('Rua das Flores, 123')).toBeInTheDocument();
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('01001-000')).toBeInTheDocument();
    expect(screen.getByText('SP')).toBeInTheDocument();
  });

  it('renders branch name', () => {
    render(<PropertyDetailSections property={makeProperty()} />);
    expect(screen.getByText('Filial Centro')).toBeInTheDocument();
  });

  it('shows em-dash for null branchName', () => {
    render(<PropertyDetailSections property={makeProperty({ branchName: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows geocoding status chip', () => {
    render(<PropertyDetailSections property={makeProperty()} />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('shows notes section when present, hides when null', () => {
    const { rerender } = render(
      <PropertyDetailSections property={makeProperty({ notes: 'Important note' })} />,
    );
    expect(screen.getByText('Observations')).toBeInTheDocument();
    expect(screen.getByText('Important note')).toBeInTheDocument();

    rerender(<PropertyDetailSections property={makeProperty({ notes: null })} />);
    expect(screen.queryByText('Observations')).not.toBeInTheDocument();
  });

  it('renders createdAt and updatedAt', () => {
    render(<PropertyDetailSections property={makeProperty()} />);
    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('Updated At')).toBeInTheDocument();
  });
});
