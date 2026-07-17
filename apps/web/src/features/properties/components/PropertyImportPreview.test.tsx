import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyImportPreview } from './PropertyImportPreview';
import type { ResolvedPropertyImportRow, ImportSummary } from '@properfy/shared';

function buildRow(overrides: Partial<ResolvedPropertyImportRow> = {}): ResolvedPropertyImportRow {
  return {
    rowNumber: 2,
    severity: 'ready',
    importable: true,
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    notes: null,
    property: {
      resolution: 'new',
      propertyId: null,
      propertyCode: 'PROP-001',
      street: '1 Main St',
      addressLine2: null,
      suburb: 'Kogarah',
      state: 'NSW',
      postcode: '2217',
      country: 'AU',
      duplicateOfRow: null,
      geocode: null,
    },
    issues: [],
    ...overrides,
  };
}

const SUMMARY: ImportSummary = { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 };

describe('PropertyImportPreview', () => {
  it('renders summary tiles', () => {
    render(<PropertyImportPreview rows={[buildRow()]} summary={{ totalRows: 5, importable: 3, withWarnings: 1, withErrors: 2 }} />);
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Importable')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('shows a New badge with the address and property code', () => {
    render(<PropertyImportPreview rows={[buildRow()]} summary={SUMMARY} />);
    expect(screen.getByText(/New property/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Main St/)).toBeInTheDocument();
  });

  it('shows an Existing badge for an existing-property match', () => {
    const row = buildRow({
      severity: 'warning',
      property: { ...buildRow().property!, resolution: 'existing', propertyId: 'prop-9', propertyCode: 'EXIST-001' },
      issues: [{ field: 'property', code: 'ADDRESS_MATCHES_EXISTING', severity: 'warning', message: 'Address matches existing property EXIST-001 — this row will reuse it and create nothing' }],
    });
    render(<PropertyImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Existing property')).toBeInTheDocument();
    expect(screen.getByText(/reuse it and create nothing/)).toBeInTheDocument();
  });

  it('renders a Success geocode badge for a found verification', () => {
    const row = buildRow({
      property: { ...buildRow().property!, geocode: { status: 'found', lat: -33.9, lng: 151.1 } },
    });
    render(<PropertyImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('renders a Failed geocode badge and the warning for a not_found verification', () => {
    const row = buildRow({
      severity: 'warning',
      property: { ...buildRow().property!, geocode: { status: 'not_found', lat: null, lng: null } },
      issues: [{ field: 'property', code: 'ADDRESS_NOT_FOUND', severity: 'warning', message: 'Address was not found by geocoding — the property will be created but flagged for manual location' }],
    });
    render(<PropertyImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/not found by geocoding/)).toBeInTheDocument();
  });

  it('renders a Pending geocode badge for an unverified verification', () => {
    const row = buildRow({
      property: { ...buildRow().property!, geocode: { status: 'unverified', lat: null, lng: null } },
    });
    render(<PropertyImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders no geocode badge when geocode is null', () => {
    render(<PropertyImportPreview rows={[buildRow()]} summary={SUMMARY} />);
    expect(screen.queryByText('Success')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it('marks intra-batch duplicates with "same as row X"', () => {
    const row = buildRow({
      rowNumber: 3,
      property: { ...buildRow().property!, duplicateOfRow: 2 },
    });
    render(<PropertyImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText(/same as row 2/i)).toBeInTheDocument();
  });

  it('paginates rows beyond the page size', () => {
    const rows = Array.from({ length: 25 }, (_, i) => buildRow({
      rowNumber: i + 2,
      propertyCode: `PROP-${i + 2}`,
      property: { ...buildRow().property!, propertyCode: `PROP-${i + 2}`, street: `${i + 2} Main St` },
    }));
    render(<PropertyImportPreview rows={rows} summary={{ totalRows: 25, importable: 25, withWarnings: 0, withErrors: 0 }} />);

    expect(screen.queryByTestId('preview-row-26')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Rows 21–25 of 25')).toBeInTheDocument();
    expect(screen.getByTestId('preview-row-26')).toBeInTheDocument();
  });

  it('clamps to a valid page when rows shrinks below the current page (re-preview with fewer rows)', () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => buildRow({ rowNumber: i + 2 }));
    const { rerender } = render(
      <PropertyImportPreview rows={manyRows} summary={{ totalRows: 25, importable: 25, withWarnings: 0, withErrors: 0 }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // now on page 2 (rows 21-25)

    const fewRows = [buildRow({ rowNumber: 2 })];
    rerender(<PropertyImportPreview rows={fewRows} summary={{ totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 }} />);

    expect(screen.getByTestId('preview-row-2')).toBeInTheDocument();
  });

  it('shows error rows as not importable with their issues', () => {
    const row = buildRow({
      severity: 'error',
      importable: false,
      property: null,
      issues: [{ field: 'street', code: 'PROPERTY_STREET_REQUIRED', severity: 'error', message: 'Street is required' }],
    });
    render(<PropertyImportPreview rows={[row]} summary={{ totalRows: 1, importable: 0, withWarnings: 0, withErrors: 1 }} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Not importable')).toBeInTheDocument();
    expect(screen.getByText('Street is required')).toBeInTheDocument();
  });
});
