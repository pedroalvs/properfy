import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { RawCell, RawCustomFieldCandidate, RawImportRow } from '../domain/appointment-import-normalize';

/**
 * Exact spreadsheet header (trimmed) -> internal field name. Everything NOT
 * in this map is either a dynamic `CUSTOM: {name}` candidate (see
 * `CUSTOM_HEADER_RE`) or silently ignored (unknown header, e.g. a stray
 * export column an agency's tool adds).
 */
export const APPOINTMENT_IMPORT_HEADER_MAP: Record<string, Exclude<keyof RawImportRow, 'customFieldCandidates'>> = {
  'Type': 'serviceTypeName',
  'Date': 'scheduledDate',
  'Start Time': 'timeSlotStart',
  'End Time': 'timeSlotEnd',
  'Street': 'street',
  'Suburb': 'suburb',
  'State': 'state',
  'Postcode': 'postcode',
  'Country': 'country',
  'Address line 2': 'addressLine2',
  'Apartment': 'apartmentNumber',
  'Notes': 'notes',
  'Realty description': 'realtyDescription',
  'Tenant name': 'primaryContactName',
  'Tenant mail': 'primaryContactEmail',
  'Tenant phone': 'primaryContactPhone',
  'EMAIL: Tenant secondary mail': 'secondaryEmail',
  'PHONE: Tenant secondary phone': 'secondaryPhone',
  'EMAIL: Tenant tertiary mail': 'tertiaryEmail',
  'PHONE: Tenant tertiary phone': 'tertiaryPhone',
  'EMAIL: Tenant quaternary mail': 'quaternaryEmail',
  'PHONE: Tenant quaternary phone': 'quaternaryPhone',
};

/** Any header not in the static map matching this becomes a custom-field
 * candidate — this is how the real sample file's own `CUSTOM: Complete
 * Property Address` column is picked up with zero special-casing, and how
 * an agency can add up to 4 (see CUSTOM_FIELDS_MAX) of their own. */
const CUSTOM_HEADER_RE = /^CUSTOM:\s*(.+)$/i;

const EMPTY_ROW: Omit<RawImportRow, 'customFieldCandidates'> = {
  serviceTypeName: null, scheduledDate: null, timeSlotStart: null, timeSlotEnd: null,
  street: null, addressLine2: null, apartmentNumber: null, suburb: null, state: null, postcode: null, country: null,
  notes: null, realtyDescription: null,
  primaryContactName: null, primaryContactEmail: null, primaryContactPhone: null,
  secondaryEmail: null, secondaryPhone: null,
  tertiaryEmail: null, tertiaryPhone: null,
  quaternaryEmail: null, quaternaryPhone: null,
};

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
    // else: unknown header, ignored.
  }

  return { ...(row as Omit<RawImportRow, 'customFieldCandidates'>), customFieldCandidates };
}

function parseCsv(buffer: Buffer): RawImportRow[] {
  const records: Array<Record<string, string>> = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records.map(buildRawImportRow);
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

async function parseXlsx(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  const rows: RawImportRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '').trim();
      });
      return;
    }

    const record: Record<string, RawCell> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) record[header] = extractCellValue(cell);
    });
    rows.push(buildRawImportRow(record));
  });

  return rows;
}

/** Parses an uploaded appointment-import file into `RawImportRow[]`, already
 * keyed by internal field name (header mapping happens here, not in the
 * resolver). `.xlsx` preserves cell types; `.csv` has none to preserve. */
export async function parseAppointmentImportFile(
  buffer: Buffer,
  ext: 'xlsx' | 'csv',
): Promise<RawImportRow[]> {
  return ext === 'csv' ? parseCsv(buffer) : parseXlsx(buffer);
}
