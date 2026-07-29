import { describe, it, expect } from 'vitest';
import { importFileIssueSchema } from '@properfy/shared';
import {
  ImportFileError,
  ImportFileEmptyError,
  ImportFileContentMismatchError,
  ImportFileCorruptXlsxError,
  ImportFileCorruptCsvError,
  ImportFileNoWorksheetsError,
  ImportFileNoHeaderRowError,
  ImportFileMissingColumnsError,
  multipleSheetsWarning,
  unknownColumnsWarning,
  noDataRowsWarning,
} from './appointment-import.errors';

/** Every blocking file problem MUST be a 4xx carrying its own code: the shared
 * `getErrorMessage` replaces the message of anything >= 500 with a generic
 * string, so a 500 physically cannot tell the user what is wrong. */
describe('ImportFileError contract', () => {
  const cases: Array<[string, ImportFileError]> = [
    ['empty', new ImportFileEmptyError()],
    ['content mismatch', new ImportFileContentMismatchError('xlsx', 'pdf')],
    ['corrupt xlsx', new ImportFileCorruptXlsxError()],
    ['corrupt csv', new ImportFileCorruptCsvError()],
    ['no worksheets', new ImportFileNoWorksheetsError()],
    ['no header row', new ImportFileNoHeaderRowError()],
    ['missing columns', new ImportFileMissingColumnsError(['Suburb'], ['Type'])],
  ];

  it.each(cases)('%s is a 400 with a specific code', (_label, error) => {
    expect(error).toBeInstanceOf(ImportFileError);
    expect(error.statusCode).toBe(400);
    expect(error.code).not.toBe('VALIDATION_ERROR');
    expect(error.code).toBe(error.issue.code);
  });

  it.each(cases)('%s carries a schema-valid issue as its only detail', (_label, error) => {
    expect(error.details).toEqual([error.issue]);
    expect(importFileIssueSchema.safeParse(error.issue).success).toBe(true);
    expect(error.issue.severity).toBe('error');
    expect(error.issue.message).toBe(error.message);
  });
});

describe('blocking error copy', () => {
  it('names the byte count for an empty file', () => {
    expect(new ImportFileEmptyError().message).toBe(
      'The uploaded file is empty (0 bytes). Check the file and upload it again.',
    );
  });

  it('tells an .xlsx-named legacy .xls how to convert itself', () => {
    expect(new ImportFileContentMismatchError('xlsx', 'ole2').message).toBe(
      'This file is named .xlsx but its contents are a legacy Excel file (.xls). Open it in Excel and use "Save As" to save it as .xlsx, then upload it again.',
    );
  });

  it('gives a generic .xlsx mismatch message for any other content', () => {
    expect(new ImportFileContentMismatchError('xlsx', 'pdf').message).toBe(
      'This file is named .xlsx but its contents are not an Excel workbook. Re-save it in the format its name says, or rename it to match, then upload it again.',
    );
  });

  it('tells a .csv-named workbook to be renamed or re-exported', () => {
    expect(new ImportFileContentMismatchError('csv', 'zip').message).toBe(
      'This file is named .csv but its contents are an Excel workbook. Rename it to .xlsx, or export it as CSV from Excel, then upload it again.',
    );
  });

  it('gives a generic .csv mismatch message for any other content', () => {
    expect(new ImportFileContentMismatchError('csv', 'binary').message).toBe(
      'This file is named .csv but its contents are not text. Export it as CSV from Excel or Google Sheets and upload it again.',
    );
  });

  it('describes a corrupt workbook', () => {
    expect(new ImportFileCorruptXlsxError().message).toBe(
      'This .xlsx file could not be opened — it looks corrupted or incomplete. Open it in Excel or Google Sheets, re-save it as .xlsx, and upload it again.',
    );
  });

  it('names the offending line for a corrupt csv when one is known', () => {
    expect(new ImportFileCorruptCsvError(14).message).toBe(
      'This .csv file could not be read — the rows do not form a consistent table (line 14). Check for an unclosed quote or a row with a different number of columns, then upload it again.',
    );
  });

  it('omits the line fragment for a corrupt csv when the line is unknown', () => {
    expect(new ImportFileCorruptCsvError().message).toBe(
      'This .csv file could not be read — the rows do not form a consistent table. Check for an unclosed quote or a row with a different number of columns, then upload it again.',
    );
  });

  it('describes a workbook with no worksheets', () => {
    expect(new ImportFileNoWorksheetsError().message).toBe(
      'This workbook has no worksheets. Add a sheet containing your appointment data and upload it again.',
    );
  });

  it('points at the template when there is no header row', () => {
    expect(new ImportFileNoHeaderRowError().message).toBe(
      'No column headers were found in this file. The first row must contain the column names — use the "Download template" link to see the expected columns.',
    );
  });
});

/** The names travel in the structured arrays, never inside the sentence — a
 * 300-character message is unreadable in the centred ErrorState and in the
 * snackbar, while two scannable lists below it are not. */
describe('ImportFileMissingColumnsError', () => {
  it('names a single missing column inline', () => {
    const error = new ImportFileMissingColumnsError(['Suburb'], ['Type', 'Street']);
    expect(error.message).toBe('This file is missing the required column "Suburb".');
  });

  it('counts multiple missing columns instead of listing them in the sentence', () => {
    const error = new ImportFileMissingColumnsError(['Suburb', 'Postcode'], ['Type']);
    expect(error.message).toBe('This file is missing 2 required columns.');
  });

  it('carries both column lists in the issue payload', () => {
    const error = new ImportFileMissingColumnsError(['Suburb', 'Postcode'], ['Type', 'Street']);
    expect(error.issue.missingColumns).toEqual(['Suburb', 'Postcode']);
    expect(error.issue.foundColumns).toEqual(['Type', 'Street']);
    expect(error.issue.unknownColumns).toEqual([]);
  });

  // The whole point: a file missing "Postcode" usually has "Postcodee" in it,
  // and connecting the two turns a blocked import into a rename.
  it('carries the unrecognized headers so a typo can be matched to what it meant', () => {
    const error = new ImportFileMissingColumnsError(
      ['Postcode'],
      ['Type', 'Street'],
      [{ column: 'Postcodee', suggestion: 'Postcode' }],
    );
    expect(error.issue.unknownColumns).toEqual([{ column: 'Postcodee', suggestion: 'Postcode' }]);
  });
});

describe('non-blocking warnings', () => {
  it('names the sheet used and the single sheet ignored', () => {
    const issue = multipleSheetsWarning('Appointments', ['Instructions']);
    expect(issue.severity).toBe('warning');
    expect(issue.code).toBe('IMPORT_FILE_MULTIPLE_SHEETS');
    expect(issue.message).toBe(
      'This workbook has 2 sheets. Only "Appointments" was imported; "Instructions" was ignored.',
    );
    expect(issue.sheetUsed).toBe('Appointments');
    expect(issue.sheetsIgnored).toEqual(['Instructions']);
  });

  it('counts the ignored sheets when there is more than one', () => {
    const issue = multipleSheetsWarning('Appointments', ['Cover', 'Notes', 'Lookup']);
    expect(issue.message).toBe(
      'This workbook has 4 sheets. Only "Appointments" was imported; 3 other sheets were ignored.',
    );
  });

  it('names a single unrecognized column', () => {
    const issue = unknownColumnsWarning([{ column: 'Postcodee', suggestion: 'Postcode' }]);
    expect(issue.severity).toBe('warning');
    expect(issue.code).toBe('IMPORT_FILE_UNKNOWN_COLUMNS');
    expect(issue.message).toBe('The column "Postcodee" was not recognized and was ignored.');
    expect(issue.unknownColumns).toEqual([{ column: 'Postcodee', suggestion: 'Postcode' }]);
  });

  it('counts multiple unrecognized columns', () => {
    const issue = unknownColumnsWarning([
      { column: 'Postcodee', suggestion: 'Postcode' },
      { column: 'Owner phone', suggestion: null },
    ]);
    expect(issue.message).toBe('2 columns were not recognized and were ignored.');
  });

  it('reports a header-only file', () => {
    const issue = noDataRowsWarning();
    expect(issue.severity).toBe('warning');
    expect(issue.message).toBe('This file has column headers but no data rows.');
  });

  it.each([
    ['multiple sheets', multipleSheetsWarning('A', ['B'])],
    ['unknown columns', unknownColumnsWarning([{ column: 'X', suggestion: null }])],
    ['no data rows', noDataRowsWarning()],
  ])('%s produces a schema-valid issue', (_label, issue) => {
    expect(importFileIssueSchema.safeParse(issue).success).toBe(true);
  });
});
