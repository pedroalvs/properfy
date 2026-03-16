import ExcelJS from 'exceljs';
import type { IXlsxGenerator, ReportColumn } from '../domain/xlsx-generator';

export class ExcelJsXlsxGenerator implements IXlsxGenerator {
  async generate(columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    sheet.columns = columns.map((col) => ({
      header: col.label,
      key: col.key,
      width: col.width ?? 20,
    }));

    sheet.views = [{ state: 'frozen' as const, ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow(row);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
