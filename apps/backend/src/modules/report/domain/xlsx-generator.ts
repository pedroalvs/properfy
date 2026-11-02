export interface ReportColumn {
  key: string;
  label: string;
  width?: number;
}

export interface XlsxGenerateOptions {
  sheetName?: string;
  preamble?: string[][];
}

export interface IXlsxGenerator {
  generate(
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
    opts?: XlsxGenerateOptions,
  ): Promise<Buffer>;
}
