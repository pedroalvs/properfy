import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ImportFileIssue } from '@properfy/shared';
import { ImportFileIssues } from './ImportFileIssues';

function issue(overrides: Partial<ImportFileIssue>): ImportFileIssue {
  return {
    code: 'IMPORT_FILE_MULTIPLE_SHEETS',
    severity: 'warning',
    message: 'Something happened.',
    missingColumns: [],
    foundColumns: [],
    unknownColumns: [],
    sheetUsed: null,
    sheetsIgnored: [],
    ...overrides,
  };
}

describe('ImportFileIssues', () => {
  it('renders nothing when there are no issues', () => {
    const { container } = render(<ImportFileIssues issues={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the backend message verbatim', () => {
    render(<ImportFileIssues issues={[issue({ message: 'This workbook has 2 sheets.' })]} />);
    expect(screen.getByText('This workbook has 2 sheets.')).toBeInTheDocument();
  });

  it('lists the missing columns and the columns that were found', () => {
    render(<ImportFileIssues issues={[issue({
      code: 'IMPORT_FILE_MISSING_COLUMNS',
      severity: 'error',
      message: 'This file is missing 2 required columns.',
      missingColumns: ['Suburb', 'Postcode'],
      foundColumns: ['Type', 'Street'],
    })]} />);

    expect(screen.getByText('Missing required columns')).toBeInTheDocument();
    expect(screen.getByText('Suburb')).toBeInTheDocument();
    expect(screen.getByText('Postcode')).toBeInTheDocument();
    expect(screen.getByText(/Type, Street/)).toBeInTheDocument();
  });

  it('uses the alert role for an error issue', () => {
    render(<ImportFileIssues issues={[issue({ severity: 'error' })]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not use the alert role for a warning issue', () => {
    render(<ImportFileIssues issues={[issue({ severity: 'warning' })]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a did-you-mean for a near-miss column', () => {
    render(<ImportFileIssues issues={[issue({
      code: 'IMPORT_FILE_UNKNOWN_COLUMNS',
      unknownColumns: [{ column: 'Postcodee', suggestion: 'Postcode' }],
    })]} />);

    expect(screen.getByText(/did you mean "Postcode"\?/)).toBeInTheDocument();
  });

  it('omits the did-you-mean when nothing is close enough', () => {
    render(<ImportFileIssues issues={[issue({
      code: 'IMPORT_FILE_UNKNOWN_COLUMNS',
      unknownColumns: [{ column: 'Owner phone', suggestion: null }],
    })]} />);

    expect(screen.getByText(/"Owner phone"/)).toBeInTheDocument();
    expect(screen.queryByText(/did you mean/)).not.toBeInTheDocument();
  });

  it('names the ignored sheets', () => {
    render(<ImportFileIssues issues={[issue({
      sheetUsed: 'Data',
      sheetsIgnored: ['Instructions', 'Notes'],
    })]} />);

    expect(screen.getByText(/Instructions, Notes/)).toBeInTheDocument();
  });

  it('renders one banner per issue', () => {
    render(<ImportFileIssues issues={[
      issue({ code: 'IMPORT_FILE_MULTIPLE_SHEETS' }),
      issue({ code: 'IMPORT_FILE_UNKNOWN_COLUMNS' }),
    ]} />);

    expect(screen.getByTestId('import-file-issue-IMPORT_FILE_MULTIPLE_SHEETS')).toBeInTheDocument();
    expect(screen.getByTestId('import-file-issue-IMPORT_FILE_UNKNOWN_COLUMNS')).toBeInTheDocument();
  });
  it('omits the message when an ErrorState above already shows it', () => {
    render(<ImportFileIssues showMessage={false} issues={[issue({
      code: 'IMPORT_FILE_MISSING_COLUMNS',
      severity: 'error',
      message: 'This file is missing the required column "Postcode".',
      missingColumns: ['Postcode'],
    })]} />);

    expect(screen.queryByText('This file is missing the required column "Postcode".')).not.toBeInTheDocument();
    expect(screen.getByText('Postcode')).toBeInTheDocument();
  });

  it('renders nothing at all when the message is hidden and there is no detail to add', () => {
    const { container } = render(
      <ImportFileIssues showMessage={false} issues={[issue({
        code: 'IMPORT_FILE_CORRUPT_XLSX',
        severity: 'error',
        message: 'This .xlsx file could not be opened.',
      })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
