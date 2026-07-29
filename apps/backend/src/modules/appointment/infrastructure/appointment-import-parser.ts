import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { RawCell, RawCustomFieldCandidate, RawImportRow } from '../domain/appointment-import-normalize';
import {
  APPOINTMENT_IMPORT_HEADER_MAP,
  CUSTOM_HEADER_RE,
  isRecognizableHeaderRow,
} from '../domain/appointment-import-columns';
import {
  ImportFileEmptyError,
  ImportFileContentMismatchError,
  ImportFileCorruptXlsxError,
  ImportFileCorruptCsvError,
  ImportFileNoWorksheetsError,
  ImportFileNoHeaderRowError,
} from '../domain/appointment-import.errors';
import { sniffFileKind } from '../../../shared/domain/file-signature';

/** Re-exported for the consumers that grew up importing it from here. The map
 * itself now lives in the domain, next to the required-column policy. */
export { APPOINTMENT_IMPORT_HEADER_MAP };

const EMPTY_ROW: Omit<RawImportRow, 'customFieldCandidates'> = {
  serviceTypeName: null, scheduledDate: null, timeSlotStart: null, timeSlotEnd: null,
  street: null, addressLine2: null, apartmentNumber: null, suburb: null, state: null, postcode: null, country: null,
  notes: null, realtyDescription: null,
  primaryContactName: null, primaryContactEmail: null, primaryContactPhone: null,
  secondaryEmail: null, secondaryPhone: null,
  tertiaryEmail: null, tertiaryPhone: null,
  quaternaryEmail: null, quaternaryPhone: null,
};

/** Everything the caller needs to explain the file back to the user: the rows,
 * the headers actually found, where they were found, and which worksheet they
 * came from. */
export interface ParsedImportFile {
  rows: RawImportRow[];
  /** Header labels of the selected sheet / CSV, trimmed, in column order. */
  headers: string[];
  /** Spreadsheet row the headers came from — 1 for CSV and for every
   * well-formed workbook. Threaded into the resolver so the row numbers in
   * per-row messages stay honest when a sheet has leading blank rows. */
  headerRowNumber: number;
  /** xlsx only: the worksheet actually read, and every one skipped. */
  sheetUsed: string | null;
  sheetsIgnored: string[];
}

/** Builds one `RawImportRow` from a header->cell-value record, preserving
 * column order for CUSTOM: candidates (both `Object.entries` on a
 * csv-parse record and `row.eachCell` on an exceljs row iterate in column
 * order). */
function buildRawImportRow(record: Record<string, RawCell>): RawImportRow {
  const row: Record<string, RawCell> = { ...EMPTY_ROW };
  const customFieldCandidates: RawCustomFieldCandidate[] = [];

  for (const [header, value] of Object.entries(record)) {
    const trimmedHeader = header.trim();
    const mappedField = APPOINTMENT_IMPORT_HEADER_MAP[trimmedHeader];
    if (mappedField) {
      row[mappedField] = value;
      continue;
    }
    const customMatch = CUSTOM_HEADER_RE.exec(trimmedHeader);
    if (customMatch) {
      customFieldCandidates.push({ label: customMatch[1]!.trim(), rawValue: value });
    }
    // else: unknown header. Dropped here, reported by analyzeImportHeaders.
  }

  return { ...(row as Omit<RawImportRow, 'customFieldCandidates'>), customFieldCandidates };
}

/** Rejects a file whose leading bytes contradict its extension, before either
 * format parser gets a chance to fail with an opaque low-level error. */
function assertFileMatchesExtension(buffer: Buffer, ext: 'xlsx' | 'csv'): void {
  const kind = sniffFileKind(buffer);
  if (kind === 'empty') throw new ImportFileEmptyError();

  if (ext === 'xlsx' && kind !== 'zip') {
    throw new ImportFileContentMismatchError('xlsx', kind);
  }
  if (ext === 'csv' && kind !== 'text') {
    throw new ImportFileContentMismatchError('csv', kind);
  }
}

/** csv-parse reports the offending line on its `CsvError`; surface that, never
 * the raw error text (which would leak internals into a user-facing message). */
function csvErrorLine(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const lines = (err as { lines?: unknown }).lines;
  return typeof lines === 'number' ? lines : undefined;
}

function parseCsv(buffer: Buffer): ParsedImportFile {
  let headers: string[] = [];
  let records: Array<Record<string, string>>;

  try {
    records = parse(buffer, {
      // Capture the header row as it is consumed, so a header-only file can
      // still report which columns it has.
      columns: (raw: string[]) => {
        headers = raw.map((header) => String(header ?? '').trim());
        return raw;
      },
      skip_empty_lines: true,
      trim: true,
      // Excel-for-Windows "CSV UTF-8" prefixes a BOM, which without this makes
      // the first header U+FEFF + "Type" — silently dropping that column.
      bom: true,
    });
  } catch (err) {
    throw new ImportFileCorruptCsvError(csvErrorLine(err), err);
  }

  if (headers.length === 0) throw new ImportFileNoHeaderRowError();

  return {
    rows: records.map(buildRawImportRow),
    headers,
    headerRowNumber: 1,
    sheetUsed: null,
    sheetsIgnored: [],
  };
}

/** Extracts a type-preserving value from an exceljs cell. Simple cells
 * (string/number/Date/null) pass through untouched — this is the fix for
 * the legacy worker's `String(cell.value)` flattening, which is what broke
 * Excel-serial dates and numeric-stored phones/postcodes. Rich text,
 * formulas and hyperlinks (compound objects) get a best-effort text
 * extraction; anything else falls back to a plain string. */
function extractCellValue(cell: ExcelJS.Cell): RawCell {
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }
    if ('richText' in value && Array.isArray((value as { richText: unknown }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText
        .map((rt) => rt.text ?? '')
        .join('');
    }
    if ('result' in value) {
      const result = (value as { result: unknown }).result;
      if (result instanceof Date || typeof result === 'number' || typeof result === 'string') {
        return result;
      }
    }
  }
  return String(value);
}

interface HeaderRow {
  headers: string[];
  rowNumber: number;
}

/** First non-empty row of a worksheet, trimmed. `eachRow` already skips blank
 * rows, so this naturally tolerates padding above the header. */
function firstNonEmptyRow(worksheet: ExcelJS.Worksheet): HeaderRow | null {
  let found: HeaderRow | null = null;
  worksheet.eachRow((row, rowNumber) => {
    if (found) return;
    const headers: string[] = [];
    row.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });
    // `eachCell` SKIPS absent cells, so a header row with a gap (B1 cleared
    // while B2 still holds data) leaves holes in this array. A hole reads back
    // as `undefined`, and `for...of` in analyzeImportHeaders does not skip it —
    // `undefined.trim()` would throw a raw TypeError, i.e. exactly the 500 this
    // module exists to prevent. TypeScript cannot catch it: holes are not
    // representable in `string[]`.
    for (let i = 0; i < headers.length; i += 1) headers[i] ??= '';

    if (headers.some((header) => header)) {
      found = { headers, rowNumber };
    }
  });
  return found;
}

interface SelectedWorksheet extends HeaderRow {
  worksheet: ExcelJS.Worksheet;
  ignored: string[];
}

/**
 * Picks the worksheet to read. Visible sheets are considered before hidden
 * ones, so a hidden lookup/template tab can never beat a visible data tab, and
 * the first sheet whose top row looks like headers wins — that is what stops a
 * cover or instructions tab being read as data.
 *
 * When nothing qualifies we fall back to the first sheet on purpose: the user
 * then gets a precise missing-columns message naming what IS in their file,
 * which is far more actionable than "no sheet matched".
 */
function selectWorksheet(workbook: ExcelJS.Workbook): SelectedWorksheet {
  const hidden = (ws: ExcelJS.Worksheet) => ws.state === 'hidden' || ws.state === 'veryHidden';
  const candidates = [
    ...workbook.worksheets.filter((ws) => !hidden(ws)),
    ...workbook.worksheets.filter(hidden),
  ];

  for (const worksheet of candidates) {
    const headerRow = firstNonEmptyRow(worksheet);
    if (headerRow && isRecognizableHeaderRow(headerRow.headers)) {
      return {
        worksheet,
        ...headerRow,
        ignored: workbook.worksheets.filter((ws) => ws !== worksheet).map((ws) => ws.name),
      };
    }
  }

  // Prefer a visible sheet even here: the resulting missing-columns message
  // lists the headers of whichever sheet we picked, and naming a hidden sheet
  // the user cannot open makes that message useless.
  const fallback = candidates[0]!;
  const headerRow = firstNonEmptyRow(fallback);
  if (!headerRow) throw new ImportFileNoHeaderRowError();

  return {
    worksheet: fallback,
    ...headerRow,
    ignored: workbook.worksheets.filter((ws) => ws !== fallback).map((ws) => ws.name),
  };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (err) {
    throw new ImportFileCorruptXlsxError(err);
  }

  if (workbook.worksheets.length === 0) throw new ImportFileNoWorksheetsError();

  const { worksheet, headers, rowNumber: headerRowNumber, ignored } = selectWorksheet(workbook);
  const rows: RawImportRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const record: Record<string, RawCell> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) record[header] = extractCellValue(cell);
    });
    rows.push(buildRawImportRow(record));
  });

  return { rows, headers, headerRowNumber, sheetUsed: worksheet.name, sheetsIgnored: ignored };
}

/** Parses an uploaded appointment-import file, already keyed by internal field
 * name (header mapping happens here, not in the resolver), alongside the
 * diagnostics needed to explain the file back to the user. `.xlsx` preserves
 * cell types; `.csv` has none to preserve.
 *
 * Throws an `ImportFileError` (400) for any file that cannot be read at all. */
export async function parseAppointmentImportFile(
  buffer: Buffer,
  ext: 'xlsx' | 'csv',
): Promise<ParsedImportFile> {
  assertFileMatchesExtension(buffer, ext);
  return ext === 'csv' ? parseCsv(buffer) : parseXlsx(buffer);
}
