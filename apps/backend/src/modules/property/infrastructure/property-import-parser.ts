import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { RawPropertyImportRow } from '../domain/property-import-row';

/**
 * Column headers of the property-import template, unchanged from the legacy
 * fire-and-forget importer so existing agency spreadsheets keep working —
 * headers ARE the internal field names (`propertyCode`, `street`, ...).
 * Unknown headers are silently ignored.
 */
const FIELDS: Array<keyof RawPropertyImportRow> = [
  'propertyCode', 'type', 'street', 'addressLine2', 'suburb', 'postcode', 'state', 'country', 'notes',
];

function buildRow(record: Record<string, unknown>): RawPropertyImportRow {
  const row = Object.fromEntries(FIELDS.map((f) => [f, null])) as unknown as Record<keyof RawPropertyImportRow, string | null>;
  for (const [header, value] of Object.entries(record)) {
    const field = FIELDS.find((f) => f === header.trim());
    if (!field || value == null) continue;
    const text = String(value).trim();
    row[field] = text.length > 0 ? text : null;
  }
  return row;
}

function parseCsv(buffer: Buffer): RawPropertyImportRow[] {
  const records: Array<Record<string, string>> = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records.map(buildRow);
}

async function parseXlsx(buffer: Buffer): Promise<RawPropertyImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  const rows: RawPropertyImportRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '').trim();
      });
      return;
    }
    const record: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) record[header] = cell.value;
    });
    rows.push(buildRow(record));
  });

  return rows;
}

/** Parses an uploaded property-import file into `RawPropertyImportRow[]`. */
export async function parsePropertyImportFile(
  buffer: Buffer,
  ext: 'xlsx' | 'csv',
): Promise<RawPropertyImportRow[]> {
  return ext === 'csv' ? parseCsv(buffer) : parseXlsx(buffer);
}
