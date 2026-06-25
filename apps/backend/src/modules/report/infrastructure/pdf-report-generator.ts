import type { IReportGenerator } from '../domain/report-generator';
import type { ReportColumn } from '../domain/xlsx-generator';

/**
 * Stub PDF report generator.
 *
 * Generates a minimal text-based PDF (valid PDF 1.4 structure).
 * This is a placeholder for a future pdfmake or similar integration
 * that would produce properly formatted PDF reports with tables,
 * headers, and styling.
 *
 * The generated PDF contains the report data as plain text, one row
 * per line, which is sufficient for basic PDF output but not
 * production-quality reports.
 */
export class PdfReportGenerator implements IReportGenerator {
  async generate(columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
    // Build plain text content
    const headerLine = columns.map((c) => c.label).join(' | ');
    const separator = '-'.repeat(headerLine.length);

    const dataLines = rows.map((row) =>
      columns.map((col) => String(row[col.key] ?? '')).join(' | '),
    );

    const textContent = [headerLine, separator, ...dataLines].join('\n');

    // Generate a minimal valid PDF with the text content
    return this.buildMinimalPdf(textContent);
  }

  contentType(): string {
    return 'application/pdf';
  }

  fileExtension(): string {
    return 'pdf';
  }

  /**
   * Builds a minimal valid PDF 1.4 document with the given text content.
   * This produces a structurally valid PDF that can be opened by any PDF reader.
   */
  private buildMinimalPdf(text: string): Buffer {
    const lines = text.split('\n');
    // Encode text as PDF text showing operators (Tj)
    const textOps = lines
      .map((line, i) => {
        const escaped = line
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)');
        // Move to next line (except first)
        return i === 0
          ? `(${escaped}) Tj`
          : `0 -14 Td (${escaped}) Tj`;
      })
      .join('\n');

    const stream = `BT\n/F1 10 Tf\n50 750 Td\n${textOps}\nET`;
    const streamLength = Buffer.byteLength(stream, 'utf-8');

    const objects: string[] = [];
    const offsets: number[] = [];
    let body = '';

    // Object 1: Catalog
    offsets.push(Buffer.byteLength(body, 'utf-8') + 15); // %PDF-1.4\n length
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Object 2: Pages
    objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    // Object 3: Page
    objects.push(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    );

    // Object 4: Stream
    objects.push(
      `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );

    // Object 5: Font
    objects.push(
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    );

    // Build document
    body = '%PDF-1.4\n';
    const realOffsets: number[] = [];
    for (const obj of objects) {
      realOffsets.push(Buffer.byteLength(body, 'utf-8'));
      body += obj;
    }

    const xrefOffset = Buffer.byteLength(body, 'utf-8');
    body += 'xref\n';
    body += `0 ${objects.length + 1}\n`;
    body += '0000000000 65535 f \n';
    for (const offset of realOffsets) {
      body += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    body += 'trailer\n';
    body += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    body += 'startxref\n';
    body += `${xrefOffset}\n`;
    body += '%%EOF\n';

    return Buffer.from(body, 'utf-8');
  }
}
