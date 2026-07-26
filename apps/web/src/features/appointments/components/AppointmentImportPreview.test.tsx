import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentImportPreview } from './AppointmentImportPreview';
import type { ResolvedImportRow, ImportSummary } from '@properfy/shared';

function buildRow(overrides: Partial<ResolvedImportRow> = {}): ResolvedImportRow {
  return {
    rowNumber: 2,
    severity: 'ready',
    importable: true,
    serviceTypeName: 'Routine Inspection',
    serviceTypeId: 'st-1',
    scheduledDate: '2027-06-20',
    scheduledDateDefaulted: false,
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    timeDefaulted: false,
    notes: null,
    property: {
      resolution: 'existing',
      propertyId: 'prop-1',
      propertyCode: 'PROP-001',
      street: '1 Main St',
      addressLine2: null, apartmentNumber: null,
      suburb: 'Kogarah',
      state: 'NSW',
      postcode: '2217',
      country: 'AU',
      duplicateOfRow: null,
      geocode: null,
    },
    contact: {
      resolution: 'new',
      contactId: null,
      displayName: 'Jane Smith',
      primaryEmail: 'jane@example.com',
      primaryPhone: '0412345678',
      additionalChannels: [],
      channelsDropped: false,
    },
    customFields: [],
    customFieldsTruncated: false,
    issues: [],
    ...overrides,
  };
}

const SUMMARY: ImportSummary = { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 };

describe('AppointmentImportPreview', () => {
  it('renders the summary bar counts', () => {
    render(<AppointmentImportPreview rows={[buildRow()]} summary={{ totalRows: 5, importable: 3, withWarnings: 2, withErrors: 2 }} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('2')).toHaveLength(2);
  });

  it('shows a ready row with no issues', () => {
    render(<AppointmentImportPreview rows={[buildRow()]} summary={SUMMARY} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows a warning row with its issue message', () => {
    const row = buildRow({
      severity: 'warning',
      scheduledDateDefaulted: true,
      issues: [{ field: 'scheduledDate', code: 'DEFAULT_APPLIED_DATE', severity: 'warning', message: 'Date empty; defaulted to today' }],
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Date empty; defaulted to today')).toBeInTheDocument();
  });

  it('shows an error row and marks it not importable', () => {
    const row = buildRow({
      severity: 'error', importable: false,
      issues: [{ field: 'serviceType', code: 'SERVICE_TYPE_NOT_FOUND', severity: 'error', message: 'No service type named "Bogus"' }],
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('No service type named "Bogus"')).toBeInTheDocument();
  });

  it('shows a New badge for a new property and Existing for an existing one', () => {
    const newRow = buildRow({
      rowNumber: 2,
      property: { resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, apartmentNumber: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null, geocode: null },
    });
    render(<AppointmentImportPreview rows={[newRow]} summary={SUMMARY} />);
    expect(screen.getByText(/New property/i)).toBeInTheDocument();
    expect(screen.getByText(/9 New St/)).toBeInTheDocument();
  });

  it('shows "same as row X" for an intra-batch duplicate new property', () => {
    const row = buildRow({
      rowNumber: 3,
      property: { resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, apartmentNumber: null, suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: 2, geocode: null },
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText(/same as row 2/i)).toBeInTheDocument();
  });

  it('shows a New badge with additional channels for a new contact', () => {
    const row = buildRow({
      contact: {
        resolution: 'new', contactId: null, displayName: 'Jane Smith',
        primaryEmail: 'jane@example.com', primaryPhone: '0412345678',
        additionalChannels: [{ channel: 'EMAIL', value: 'second@example.com', label: 'Secondary' }],
        channelsDropped: false,
      },
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText(/New contact/i)).toBeInTheDocument();
    expect(screen.getByText(/second@example.com/)).toBeInTheDocument();
  });

  it('shows a Sheet data badge for a snapshot-only contact (collides with a differing registry contact)', () => {
    const row = buildRow({
      contact: {
        resolution: 'snapshot-only', contactId: null, displayName: 'Jane Smith',
        primaryEmail: 'jane@example.com', primaryPhone: '0412345678',
        additionalChannels: [], channelsDropped: false,
      },
      issues: [{ field: 'contact', code: 'CONTACT_MISMATCH_SNAPSHOT_ONLY', severity: 'warning', message: 'Row contact shares an email/phone with a registry contact but the data differs' }],
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Sheet data')).toBeInTheDocument();
    expect(screen.queryByText(/New contact/i)).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('shows a warning note when extra channels were not applied to an existing contact', () => {
    const row = buildRow({
      contact: {
        resolution: 'existing', contactId: 'contact-1', displayName: 'Jane Smith',
        primaryEmail: 'jane@example.com', primaryPhone: '0412345678',
        additionalChannels: [], channelsDropped: true,
      },
      issues: [{ field: 'contact', code: 'CONTACT_CHANNELS_NOT_APPLIED', severity: 'warning', message: 'Existing contact linked; extra channels from the sheet were not applied' }],
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Existing contact')).toBeInTheDocument();
    expect(screen.getByText(/extra channels from the sheet were not applied/i)).toBeInTheDocument();
  });

  it('renders custom fields as label:value pairs', () => {
    const row = buildRow({ customFields: [{ label: 'Access Instructions', value: 'Ring buzzer 4' }] });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Access Instructions')).toBeInTheDocument();
    expect(screen.getByText('Ring buzzer 4')).toBeInTheDocument();
  });

  it('shows a truncation note when more than 4 custom-field columns were found', () => {
    const row = buildRow({ customFieldsTruncated: true });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText(/only the first 4/i)).toBeInTheDocument();
  });

  it('shows a defaulted badge for the date and time when applied', () => {
    const row = buildRow({ scheduledDateDefaulted: true, timeDefaulted: true });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getAllByText(/defaulted/i).length).toBeGreaterThan(0);
  });

  it('paginates rows beyond the page size', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 25 }, (_, i) => buildRow({ rowNumber: i + 2 }));
    render(<AppointmentImportPreview rows={rows} summary={{ totalRows: 25, importable: 25, withWarnings: 0, withErrors: 0 }} />);

    expect(screen.queryByText('row-2')).not.toBeInTheDocument(); // sanity: rows aren't keyed by literal text
    expect(screen.getAllByText('PROP-001').length).toBeLessThan(25);

    const nextButton = screen.getByRole('button', { name: /next/i });
    await user.click(nextButton);
    expect(screen.getByText('Rows 21–25 of 25')).toBeInTheDocument();
  });

  it('renders a Success geocode badge for a found verification on a new property', () => {
    const row = buildRow({
      property: {
        resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, apartmentNumber: null,
        suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null,
        geocode: { status: 'found', lat: -33.9, lng: 151.1 },
      },
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('renders a Failed geocode badge and the ADDRESS_NOT_FOUND warning for a not_found verification', () => {
    const row = buildRow({
      severity: 'warning',
      property: {
        resolution: 'new', propertyId: null, propertyCode: null, street: '9 New St', addressLine2: null, apartmentNumber: null,
        suburb: 'Carlton', state: 'NSW', postcode: '2218', country: 'AU', duplicateOfRow: null,
        geocode: { status: 'not_found', lat: null, lng: null },
      },
      issues: [{ field: 'property', code: 'ADDRESS_NOT_FOUND', severity: 'warning', message: 'Address was not found by geocoding — the property will be created but flagged for manual location' }],
    });
    render(<AppointmentImportPreview rows={[row]} summary={SUMMARY} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/not found by geocoding/)).toBeInTheDocument();
  });

  it('renders no geocode badge for existing properties (geocode null)', () => {
    render(<AppointmentImportPreview rows={[buildRow()]} summary={SUMMARY} />);
    expect(screen.queryByText('Success')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it('clamps to a valid page when rows shrinks below the current page (re-preview with fewer rows)', () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => buildRow({ rowNumber: i + 2 }));
    const { rerender } = render(
      <AppointmentImportPreview rows={manyRows} summary={{ totalRows: 25, importable: 25, withWarnings: 0, withErrors: 0 }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // now on page 2 (rows 21-25)

    const fewRows = [buildRow({ rowNumber: 2 })];
    rerender(<AppointmentImportPreview rows={fewRows} summary={{ totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 }} />);

    expect(screen.getByTestId('preview-row-2')).toBeInTheDocument();
  });
});
