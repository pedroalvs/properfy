import type { RawImportRow } from './appointment-import-normalize';

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

/**
 * Port for reading an uploaded import file into its rows + diagnostics.
 *
 * The application layer (`PreviewAppointmentImportUseCase`) depends on this
 * port instead of importing the concrete `csv-parse`/`exceljs`-backed parser
 * from `infrastructure/` (BE-6). The concrete adapter
 * (`AppointmentImportFileParser`) lives in infrastructure and implements it.
 */
export interface IAppointmentImportFileParser {
  /** Throws an `ImportFileError` (400) for any file that cannot be read. */
  parse(buffer: Buffer, ext: 'xlsx' | 'csv'): Promise<ParsedImportFile>;
}
