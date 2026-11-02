import ExcelJS from 'exceljs';
import type { IXlsxGenerator, ReportColumn, XlsxGenerateOptions } from '../domain/xlsx-generator';

export class ExcelJsXlsxGenerator implements IXlsxGenerator {
  async generate(
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
    opts?: XlsxGenerateOptions,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(opts?.sheetName ?? 'Report');

    // No preamble → the original layout (header row 1, frozen, keyed columns).
    if (!opts?.preamble || opts.preamble.length === 0) {
      sheet.columns = columns.map((col) => ({
        header: col.label,
        key: col.key,
        width: col.width ?? 20,
      }));
      sheet.views = [{ state: 'frozen' as const, ySplit: 1 }];
      sheet.getRow(1).font = { bold: true };
      for (const row of rows) sheet.addRow(row);
      return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    // Preamble path: freeform header rows, a blank spacer, then the bold table
    // header and the data rows (in column order). `sheet.columns` is not used so
    // the preamble can occupy the top rows.
    columns.forEach((col, i) => {
      sheet.getColumn(i + 1).width = col.width ?? 20;
    });
    for (const line of opts.preamble) sheet.addRow(line);
    sheet.addRow([]);
    const headerRow = sheet.addRow(columns.map((c) => c.label));
    headerRow.font = { bold: true };
    for (const row of rows) sheet.addRow(columns.map((c) => row[c.key] ?? ''));

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
