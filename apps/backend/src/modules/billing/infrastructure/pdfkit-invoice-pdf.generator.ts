import PDFDocument from 'pdfkit';
import type { IInvoicePdfGenerator, InvoicePdfData } from '../domain/invoice-pdf-generator';

/**
 * pdfkit renderer for the Property Invoice document (spec 032). Uses the built-in Helvetica font
 * (no external font assets → no Dockerfile changes). Renders from the frozen snapshot only:
 * title "PROPERTY INVOICE", never "Tax Invoice"; no raw UUIDs; no tax line; total = sum of lines.
 */
export class PdfKitInvoicePdfGenerator implements IInvoicePdfGenerator {
  // Landscape A4 to fit the seven line columns.
  private static readonly COLUMNS = [
    { key: 'serviceDate', label: 'Service Date', width: 70 },
    { key: 'appointmentCode', label: 'Appointment', width: 80 },
    { key: 'propertyAddress', label: 'Property', width: 190 },
    { key: 'serviceType', label: 'Service Type', width: 110 },
    { key: 'agencyName', label: 'Agency', width: 110 },
    { key: 'branchName', label: 'Branch', width: 95 },
    { key: 'amount', label: 'Amount', width: 66 },
  ] as const;

  async generate(data: InvoicePdfData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.render(doc, data);
        doc.end();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  private money(amount: number, currency: string): string {
    return `${currency} ${amount.toFixed(2)}`;
  }

  /** Draws the column-label row + underline at `y`; returns the y below the header. */
  private drawTableHeader(doc: PDFKit.PDFDocument, startX: number, right: number, y: number): number {
    doc.font('Helvetica-Bold').fontSize(9);
    let x = startX;
    for (const col of PdfKitInvoicePdfGenerator.COLUMNS) {
      doc.text(col.label, x, y, { width: col.width, align: col.key === 'amount' ? 'right' : 'left' });
      x += col.width;
    }
    const bottom = y + 16;
    doc.moveTo(startX, bottom - 4).lineTo(right, bottom - 4).stroke();
    return bottom;
  }

  private render(doc: PDFKit.PDFDocument, data: InvoicePdfData): void {
    const startX = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    // Title
    doc.font('Helvetica-Bold').fontSize(20).text('PROPERTY INVOICE', startX, doc.y);
    doc.moveDown(0.3);

    // Meta block
    doc.font('Helvetica').fontSize(10);
    doc.text(`Invoice: ${data.invoiceNumberDisplay}`);
    doc.text(`Inspector: ${data.inspectorName ?? '-'}`);
    if (data.inspectorAbn) {
      doc.text(`ABN: ${data.inspectorAbn}`);
    }
    doc.text(`Period: ${data.periodStart} to ${data.periodEnd}`);
    doc.text(`Issued: ${data.issuedAt ?? '-'}`);
    doc.moveDown(0.6);

    // Table header (page 1)
    let y = this.drawTableHeader(doc, startX, right, doc.y);

    // Rows — redraw the header whenever a row spills onto a continuation page.
    doc.font('Helvetica').fontSize(9);
    for (const line of data.lines) {
      const cells: Record<string, string> = {
        serviceDate: line.serviceDate,
        appointmentCode: line.appointmentCode,
        propertyAddress: line.propertyAddress ?? '-',
        serviceType: line.serviceType ?? '-',
        agencyName: line.agencyName ?? '-',
        branchName: line.branchName ?? '-',
        amount: this.money(line.amount, data.currency),
      };
      // Tallest cell so multi-line addresses don't overlap.
      let rowHeight = 0;
      for (const col of PdfKitInvoicePdfGenerator.COLUMNS) {
        rowHeight = Math.max(rowHeight, doc.heightOfString(cells[col.key] ?? '', { width: col.width }));
      }
      if (y + rowHeight > bottomLimit()) {
        doc.addPage();
        y = this.drawTableHeader(doc, startX, right, doc.page.margins.top);
        doc.font('Helvetica').fontSize(9);
      }
      let x = startX;
      for (const col of PdfKitInvoicePdfGenerator.COLUMNS) {
        doc.text(cells[col.key] ?? '', x, y, { width: col.width, align: col.key === 'amount' ? 'right' : 'left' });
        x += col.width;
      }
      y += rowHeight + 6;
    }

    // Total — guard against being pushed past the page (a financial doc must never clip its total).
    const TOTAL_BLOCK_HEIGHT = 30;
    if (y + TOTAL_BLOCK_HEIGHT > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.moveTo(startX, y).lineTo(right, y).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(11).text(
      `Total: ${this.money(data.totalAmount, data.currency)}`,
      startX,
      y,
      { width: right - startX, align: 'right' },
    );
  }
}
