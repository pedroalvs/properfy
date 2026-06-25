import type { ReportColumn } from './xlsx-generator';

export interface IReportGenerator {
  generate(columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer>;
  contentType(): string;
  fileExtension(): string;
}
