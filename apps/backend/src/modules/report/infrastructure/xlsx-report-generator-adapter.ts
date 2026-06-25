import type { IReportGenerator } from '../domain/report-generator';
import type { IXlsxGenerator, ReportColumn } from '../domain/xlsx-generator';

/**
 * Adapts the existing IXlsxGenerator to the IReportGenerator interface.
 */
export class XlsxReportGeneratorAdapter implements IReportGenerator {
  constructor(private readonly xlsxGenerator: IXlsxGenerator) {}

  async generate(columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
    return this.xlsxGenerator.generate(columns, rows);
  }

  contentType(): string {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  fileExtension(): string {
    return 'xlsx';
  }
}
