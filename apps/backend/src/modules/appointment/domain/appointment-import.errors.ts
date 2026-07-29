import type { ImportFileIssue, ImportFileUnknownColumn } from '@properfy/shared';
import type { SniffedFileKind } from '../../../shared/domain/file-signature';
import { ValidationError } from '../../../shared/domain/errors';

/**
 * Whole-file import problems, as opposed to per-row issues.
 *
 * Every blocking case is a 400 carrying its own `code`, never a 500: the
 * shared `getErrorMessage` replaces the message of anything >= 500 with a
 * generic string, so a file problem surfaced as a 500 can never tell the user
 * what is actually wrong — which is precisely the bug this module fixes.
 *
 * The English copy lives here and nowhere else. The same sentence has to
 * appear in the HTTP envelope, in `fileIssues[].message` on a successful
 * preview and in the persisted commit failure; one producer means no drift.
 */

function issue(partial: Omit<ImportFileIssue, 'missingColumns' | 'foundColumns' | 'unknownColumns' | 'sheetUsed' | 'sheetsIgnored'> & Partial<ImportFileIssue>): ImportFileIssue {
  return {
    missingColumns: [],
    foundColumns: [],
    unknownColumns: [],
    sheetUsed: null,
    sheetsIgnored: [],
    ...partial,
  };
}

/** Base for every blocking file problem. `ValidationError(message, details,
 * code)` gives us 400 + a specific code + structured details in one step. */
export class ImportFileError extends ValidationError {
  constructor(readonly issue: ImportFileIssue) {
    super(issue.message, [issue], issue.code);
    this.name = 'ImportFileError';
  }
}

export class ImportFileEmptyError extends ImportFileError {
  constructor() {
    super(issue({
      code: 'IMPORT_FILE_EMPTY',
      severity: 'error',
      message: 'The uploaded file is empty (0 bytes). Check the file and upload it again.',
    }));
  }
}

/** The extension says one thing, the leading bytes say another. */
export class ImportFileContentMismatchError extends ImportFileError {
  constructor(ext: 'xlsx' | 'csv', kind: SniffedFileKind) {
    super(issue({
      code: 'IMPORT_FILE_CONTENT_MISMATCH',
      severity: 'error',
      message: mismatchMessage(ext, kind),
    }));
  }
}

function mismatchMessage(ext: 'xlsx' | 'csv', kind: SniffedFileKind): string {
  if (ext === 'xlsx') {
    // Worth calling out by name: "save as .xlsx" is the whole fix, and a
    // legacy .xls renamed to .xlsx is the single most common version of this.
    if (kind === 'ole2') {
      return 'This file is named .xlsx but its contents are a legacy Excel file (.xls). Open it in Excel and use "Save As" to save it as .xlsx, then upload it again.';
    }
    return 'This file is named .xlsx but its contents are not an Excel workbook. Re-save it in the format its name says, or rename it to match, then upload it again.';
  }
  if (kind === 'zip') {
    return 'This file is named .csv but its contents are an Excel workbook. Rename it to .xlsx, or export it as CSV from Excel, then upload it again.';
  }
  return 'This file is named .csv but its contents are not text. Export it as CSV from Excel or Google Sheets and upload it again.';
}

export class ImportFileCorruptXlsxError extends ImportFileError {
  constructor(override readonly cause?: unknown) {
    super(issue({
      code: 'IMPORT_FILE_CORRUPT_XLSX',
      severity: 'error',
      message: 'This .xlsx file could not be opened — it looks corrupted or incomplete. Open it in Excel or Google Sheets, re-save it as .xlsx, and upload it again.',
    }));
  }
}

export class ImportFileCorruptCsvError extends ImportFileError {
  constructor(line?: number, override readonly cause?: unknown) {
    const where = line === undefined ? '' : ` (line ${line})`;
    super(issue({
      code: 'IMPORT_FILE_CORRUPT_CSV',
      severity: 'error',
      message: `This .csv file could not be read — the rows do not form a consistent table${where}. Check for an unclosed quote or a row with a different number of columns, then upload it again.`,
    }));
  }
}

export class ImportFileNoWorksheetsError extends ImportFileError {
  constructor() {
    super(issue({
      code: 'IMPORT_FILE_NO_WORKSHEETS',
      severity: 'error',
      message: 'This workbook has no worksheets. Add a sheet containing your appointment data and upload it again.',
    }));
  }
}

export class ImportFileNoHeaderRowError extends ImportFileError {
  constructor() {
    super(issue({
      code: 'IMPORT_FILE_NO_HEADER_ROW',
      severity: 'error',
      message: 'No column headers were found in this file. The first row must contain the column names — use the "Download template" link to see the expected columns.',
    }));
  }
}

/**
 * The column names deliberately travel in `missingColumns` / `foundColumns`
 * rather than inside the sentence: the message is rendered in a centred
 * ErrorState and in a 5-second snackbar, where a 300-character list is
 * unreadable, while two scannable lists below it are not.
 */
export class ImportFileMissingColumnsError extends ImportFileError {
  constructor(
    missingColumns: string[],
    foundColumns: string[],
    /** Unrecognized headers, carried so a typo can be matched to the column it
     * was meant to be. This is the common case — a file missing "Postcode"
     * usually has "Postcodee" sitting right there. */
    unknownColumns: ImportFileUnknownColumn[] = [],
  ) {
    const message = missingColumns.length === 1
      ? `This file is missing the required column "${missingColumns[0]}".`
      : `This file is missing ${missingColumns.length} required columns.`;
    super(issue({
      code: 'IMPORT_FILE_MISSING_COLUMNS',
      severity: 'error',
      message,
      missingColumns,
      foundColumns,
      unknownColumns,
    }));
  }
}

/** Non-blocking: the import proceeds, the user is told what was skipped. */
export function multipleSheetsWarning(sheetUsed: string, sheetsIgnored: string[]): ImportFileIssue {
  const total = sheetsIgnored.length + 1;
  const ignored = sheetsIgnored.length === 1
    ? `"${sheetsIgnored[0]}" was ignored`
    : `${sheetsIgnored.length} other sheets were ignored`;
  return issue({
    code: 'IMPORT_FILE_MULTIPLE_SHEETS',
    severity: 'warning',
    message: `This workbook has ${total} sheets. Only "${sheetUsed}" was imported; ${ignored}.`,
    sheetUsed,
    sheetsIgnored,
  });
}

export function unknownColumnsWarning(unknownColumns: ImportFileUnknownColumn[]): ImportFileIssue {
  const message = unknownColumns.length === 1
    ? `The column "${unknownColumns[0]!.column}" was not recognized and was ignored.`
    : `${unknownColumns.length} columns were not recognized and were ignored.`;
  return issue({
    code: 'IMPORT_FILE_UNKNOWN_COLUMNS',
    severity: 'warning',
    message,
    unknownColumns,
  });
}

export function noDataRowsWarning(): ImportFileIssue {
  return issue({
    code: 'IMPORT_FILE_NO_DATA_ROWS',
    severity: 'warning',
    message: 'This file has column headers but no data rows.',
  });
}
