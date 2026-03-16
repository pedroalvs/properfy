export interface ReportColumn {
  key: string;
  label: string;
  width?: number;
}

export interface IXlsxGenerator {
  generate(columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer>;
}
