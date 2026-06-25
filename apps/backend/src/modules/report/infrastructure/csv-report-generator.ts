import type { IReportGenerator } from '../domain/report-generator';
import type { ReportColumn } from '../domain/xlsx-generator';

/**
 * Escapes a CSV field value according to RFC 4180.
 * Fields containing commas, double quotes, or newlines are wrapped in double quotes.
 * Double quotes within the field are escaped by doubling them.
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export class CsvReportGenerator implements IReportGenerator {
  async generate(columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
    const lines: string[] = [];

    // Header row
    lines.push(columns.map((col) => escapeCsvField(col.label)).join(','));

    // Data rows
    for (const row of rows) {
      const fields = columns.map((col) => escapeCsvField(row[col.key]));
      lines.push(fields.join(','));
    }

    return Buffer.from(lines.join('\n') + '\n', 'utf-8');
  }

  contentType(): string {
    return 'text/csv';
  }

  fileExtension(): string {
    return 'csv';
  }
}
