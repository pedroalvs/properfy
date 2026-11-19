import PDFDocument from 'pdfkit';
import { formatAuPhone, type DayPlanResponse } from '@properfy/shared';
import type { IXlsxGenerator, ReportColumn } from '../../report/domain/xlsx-generator';

/** The seven route-sheet columns (contract 01.A6, L-F04-10). No raw ids. */
export const DAY_PLAN_SHEET_COLUMNS: ReportColumn[] = [
  { key: 'seq', label: '#', width: 5 },
  { key: 'window', label: 'Window', width: 18 },
  { key: 'eta', label: 'ETA', width: 12 },
  { key: 'address', label: 'Address', width: 42 },
  { key: 'service', label: 'Service', width: 20 },
  { key: 'contact', label: 'Contact', width: 28 },
  { key: 'key', label: 'Key', width: 22 },
];

export type DayPlanSheetFormat = 'pdf' | 'xlsx';

export interface DayPlanSheetDocument {
  title: string;
  preamble: string[][];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export interface IDayPlanSheetPdfGenerator {
  render(doc: DayPlanSheetDocument): Promise<Buffer>;
}

const EM_DASH = '—';

/** HH:mm plus the short timezone abbreviation (AWST/AEDT/…) for an instant in a zone. */
function timeAndZone(iso: string, timezone: string): { time: string; zone: string } {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return { time: `${hour}:${get('minute')}`, zone: get('timeZoneName') };
}

/** dd/MM/yyyy from a civil YYYY-MM-DD. */
function formatCivilDmy(civil: string): string {
  const [y, m, d] = civil.split('-');
  return `${d}/${m}/${y}`;
}

/** dd/MM/yyyy HH:mm ABBR for an instant in the plan timezone (the "generated" stamp). */
function formatGeneratedStamp(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('day')}/${get('month')}/${get('year')} ${hour}:${get('minute')} ${get('timeZoneName')}`;
}

function formatDriveTime(totalS: number): string {
  const minutes = Math.round(totalS / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Transliterate a display name to an ASCII slug (NFKD + diacritic strip, L-F04-10).
 * Falls back to `inspector` when nothing ASCII-alphanumeric survives (e.g. CJK names).
 */
export function dayPlanSheetSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug.length > 0 ? slug : 'inspector';
}

/** The data rows (one per stop, in plan order) shared by the XLSX and PDF outputs. */
export function buildDayPlanSheetRows(plan: DayPlanResponse): Record<string, unknown>[] {
  const mixed = new Set(plan.stops.map((s) => s.timezone)).size > 1;

  return plan.stops.map((stop) => {
    const suffix = mixed ? ` ${timeAndZone(stop.windowStartAt, stop.timezone).zone}` : '';
    const eta = stop.eta ? `${timeAndZone(stop.eta, stop.timezone).time}${suffix}` : EM_DASH;

    let contact = EM_DASH;
    if (stop.primaryContact) {
      const phone = stop.primaryContact.phone ? ` · ${formatAuPhone(stop.primaryContact.phone)}` : '';
      contact = `${stop.primaryContact.name}${phone}`;
    }

    const key = stop.keyRequired
      ? stop.meetingLocation
        ? `Yes — ${stop.meetingLocation}`
        : 'Yes'
      : 'No';

    return {
      seq: stop.sequence,
      window: `${stop.windowStart}–${stop.windowEnd}${suffix}`,
      eta,
      address: stop.propertyAddress,
      service: stop.serviceTypeName,
      contact,
      key,
    };
  });
}

/** The header block written above the table (L-F04-10). No personal data. */
export function buildDayPlanSheetPreamble(plan: DayPlanResponse): string[][] {
  const mixed = new Set(plan.stops.map((s) => s.timezone)).size > 1;
  const planZone = timeAndZone(plan.computedAt, plan.timezone).zone;

  const finish = plan.finishEta
    ? `~${timeAndZone(plan.finishEta, plan.timezone).time}${mixed ? ` ${planZone}` : ''}`
    : EM_DASH;

  const lines: string[][] = [
    [`Inspector: ${plan.inspectorName}`],
    [`Date: ${formatCivilDmy(plan.date)}`],
    [`Starting from: ${plan.origin.label ?? EM_DASH}`],
    [`Finish: ${finish}`],
    [`Drive time: ${formatDriveTime(plan.totals.driveS)}`],
  ];

  if (plan.approximate) {
    lines.push(['Approximate route: some travel times are estimates']);
  }
  if (plan.status === 'STALE') {
    const stamp = formatGeneratedStamp(plan.publishedAt ?? plan.computedAt, plan.timezone);
    lines.push([`This route may be out of date (generated ${stamp})`]);
  }
  if (mixed) {
    lines.push(["Times in each agency's local time"]);
  }

  return lines;
}

/** pdfkit renderer for the route sheet. Built-in Helvetica → no font assets, no Dockerfile change. */
export class PdfKitDayPlanSheetGenerator implements IDayPlanSheetPdfGenerator {
  async render(doc: DayPlanSheetDocument): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      try {
        this.draw(pdf, doc);
        pdf.end();
      } catch (err) {
        reject(err as Error);
      }
    });
  }

  private draw(pdf: PDFKit.PDFDocument, doc: DayPlanSheetDocument): void {
    const startX = pdf.page.margins.left;
    const right = pdf.page.width - pdf.page.margins.right;
    const bottomLimit = () => pdf.page.height - pdf.page.margins.bottom;

    pdf.font('Helvetica-Bold').fontSize(16).text(doc.title, startX, pdf.y);
    pdf.moveDown(0.5);

    pdf.font('Helvetica').fontSize(10);
    for (const line of doc.preamble) {
      pdf.text(line.join(' '), startX);
    }
    pdf.moveDown(0.5);

    // Proportional column widths over the printable area.
    const totalWidth = doc.columns.reduce((sum, c) => sum + (c.width ?? 20), 0);
    const printable = right - startX;
    const widths = doc.columns.map((c) => ((c.width ?? 20) / totalWidth) * printable);

    const drawHeader = (): number => {
      pdf.font('Helvetica-Bold').fontSize(9);
      let x = startX;
      const y = pdf.y;
      doc.columns.forEach((col, i) => {
        const w = widths[i] ?? 0;
        pdf.text(col.label, x, y, { width: w });
        x += w;
      });
      const bottom = y + 16;
      pdf.moveTo(startX, bottom - 4).lineTo(right, bottom - 4).stroke();
      return bottom;
    };

    let y = drawHeader();
    pdf.font('Helvetica').fontSize(9);
    for (const row of doc.rows) {
      if (y + 20 > bottomLimit()) {
        pdf.addPage();
        y = drawHeader();
        pdf.font('Helvetica').fontSize(9);
      }
      let x = startX;
      let maxH = 0;
      doc.columns.forEach((col, i) => {
        const w = widths[i] ?? 0;
        const text = String(row[col.key] ?? '');
        pdf.text(text, x, y, { width: w });
        maxH = Math.max(maxH, pdf.heightOfString(text, { width: w }));
        x += w;
      });
      y += Math.max(18, maxH + 4);
    }
  }
}

/**
 * Renders the day-plan route sheet (contract 01.A6, L-F04-10) as XLSX or PDF from a
 * computed `DayPlanResponse`. The XLSX uses the shared ExcelJS generator with a
 * "Route" worksheet and a preamble; the PDF uses pdfkit. Both share the row set so
 * the two formats never drift.
 */
export class DayPlanSheetRenderer {
  constructor(
    private readonly xlsx: IXlsxGenerator,
    private readonly pdf: IDayPlanSheetPdfGenerator,
  ) {}

  async render(plan: DayPlanResponse, format: DayPlanSheetFormat): Promise<Buffer> {
    const rows = buildDayPlanSheetRows(plan);
    const preamble = buildDayPlanSheetPreamble(plan);
    if (format === 'xlsx') {
      return this.xlsx.generate(DAY_PLAN_SHEET_COLUMNS, rows, { sheetName: 'Route', preamble });
    }
    return this.pdf.render({
      title: 'Route sheet',
      preamble,
      columns: DAY_PLAN_SHEET_COLUMNS,
      rows,
    });
  }
}
