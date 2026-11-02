import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { DayPlanResponse, DayPlanStop } from '@properfy/shared';
import { ExcelJsXlsxGenerator } from '../../../report/infrastructure/exceljs-xlsx-generator';
import {
  DayPlanSheetRenderer,
  PdfKitDayPlanSheetGenerator,
  buildDayPlanSheetRows,
  dayPlanSheetSlug,
  type IDayPlanSheetPdfGenerator,
} from '../day-plan-sheet.renderer';

function makeStop(overrides: Partial<DayPlanStop> = {}): DayPlanStop {
  return {
    appointmentId: '11111111-1111-4111-8111-111111111111',
    sequence: 1,
    appointmentCode: 'APT-1',
    agencyName: 'Acme Realty',
    appointmentStatus: 'SCHEDULED',
    executionStatus: 'NOT_STARTED',
    eta: '2026-11-04T21:00:00.000Z', // 08:00 AEDT on 05/11
    serviceStartAt: '2026-11-04T21:00:00.000Z',
    serviceEndAt: '2026-11-04T21:45:00.000Z',
    travelS: 600,
    distanceM: 5000,
    waitS: 0,
    lateS: 0,
    windowStart: '08:00',
    windowEnd: '17:00',
    windowStartAt: '2026-11-04T21:00:00.000Z',
    windowEndAt: '2026-11-05T06:00:00.000Z',
    timezone: 'Australia/Sydney',
    durationMinutes: 45,
    manual: false,
    executed: false,
    approximate: false,
    missingCoordinates: false,
    lat: -33.88,
    lng: 151.2,
    propertyAddress: '12 King St, Surry Hills NSW 2010',
    suburb: 'Surry Hills',
    serviceTypeName: 'Routine',
    keyRequired: false,
    meetingLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
    primaryContact: { name: 'Jane Doe', phone: '+61412345678', role: 'RENTAL_TENANT' },
    ...overrides,
  };
}

function makePlan(overrides: Partial<DayPlanResponse> = {}): DayPlanResponse {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    inspectorId: '88888888-8888-4888-8888-888888888888',
    inspectorName: 'Jane Smith',
    date: '2026-11-05',
    timezone: 'Australia/Sydney',
    status: 'PUBLISHED',
    version: 1,
    publishedAt: '2026-11-04T08:30:00.000Z', // 19:30 AEDT on 04/11
    computedAt: '2026-11-04T08:30:00.000Z',
    lastTrigger: 'SCHEDULED_PUBLISH',
    approximate: false,
    approximateReason: null,
    routingProvider: 'MAPBOX',
    matrixProfile: 'driving',
    optimizerMethod: 'EXACT',
    origin: { source: 'BASE', label: 'Newtown NSW 2042', lat: -33.9, lng: 151.1 },
    originWarning: null,
    originOverride: null,
    departureAt: '2026-11-04T20:50:00.000Z',
    finishEta: '2026-11-04T23:35:00.000Z', // ~10:35 AEDT
    totals: { driveS: 1800, waitS: 0, serviceS: 2700, lateS: 0, distanceM: 5000 },
    feasible: true,
    violations: [],
    manualOrder: false,
    suggestedOrder: ['11111111-1111-4111-8111-111111111111'],
    stops: [makeStop()],
    geometry: null,
    routingInput: null,
    ...overrides,
  };
}

function makeRenderer(pdf?: IDayPlanSheetPdfGenerator): DayPlanSheetRenderer {
  return new DayPlanSheetRenderer(
    new ExcelJsXlsxGenerator(),
    pdf ?? new PdfKitDayPlanSheetGenerator(),
  );
}

describe('buildDayPlanSheetRows', () => {
  it('maps a stop to the seven route-sheet columns', () => {
    const [row] = buildDayPlanSheetRows(makePlan());
    expect(row!).toMatchObject({
      seq: 1,
      window: '08:00–17:00',
      eta: '08:00',
      address: '12 King St, Surry Hills NSW 2010',
      service: 'Routine',
      contact: 'Jane Doe · 0412 345 678',
      key: 'No',
    });
  });

  it('renders a key requirement with the meeting location', () => {
    const [row] = buildDayPlanSheetRows(
      makePlan({ stops: [makeStop({ keyRequired: true, meetingLocation: 'Front desk' })] }),
    );
    expect(row!.key).toBe('Yes — Front desk');
  });

  it('renders a bare key requirement without a meeting location', () => {
    const [row] = buildDayPlanSheetRows(
      makePlan({ stops: [makeStop({ keyRequired: true, meetingLocation: null })] }),
    );
    expect(row!.key).toBe('Yes');
  });

  it('shows an em dash when there is no contact', () => {
    const [row] = buildDayPlanSheetRows(
      makePlan({ stops: [makeStop({ primaryContact: null })] }),
    );
    expect(row!.contact).toBe('—');
  });

  it('shows just the name when the contact has no phone', () => {
    const [row] = buildDayPlanSheetRows(
      makePlan({ stops: [makeStop({ primaryContact: { name: 'No Phone', phone: null, role: 'OTHER' } })] }),
    );
    expect(row!.contact).toBe('No Phone');
  });

  it('shows an em dash for an executed stop with no prediction', () => {
    const [row] = buildDayPlanSheetRows(
      makePlan({ stops: [makeStop({ executed: true, eta: null })] }),
    );
    expect(row!.eta).toBe('—');
  });

  it('formats the ETA in the agency timezone (Perth shows 08:00 local)', () => {
    const [row] = buildDayPlanSheetRows(
      makePlan({
        stops: [makeStop({ timezone: 'Australia/Perth', eta: '2026-11-05T00:00:00.000Z' })],
      }),
    );
    expect(row!.eta).toBe('08:00');
  });

  it('adds a timezone suffix to ETA and Window only when agencies differ', () => {
    const perth = makeStop({
      appointmentId: '22222222-2222-4222-8222-222222222222',
      sequence: 1,
      timezone: 'Australia/Perth',
      eta: '2026-11-05T00:00:00.000Z',
      windowStart: '08:00',
      windowEnd: '10:00',
      windowStartAt: '2026-11-05T00:00:00.000Z',
    });
    const sydney = makeStop({ sequence: 2, windowEnd: '10:00' });
    const rows = buildDayPlanSheetRows(makePlan({ stops: [perth, sydney] }));
    expect(rows[0]!.window).toBe('08:00–10:00 AWST');
    expect(rows[0]!.eta).toBe('08:00 AWST');
    expect(rows[1]!.window).toBe('08:00–10:00 AEDT');
    expect(rows[1]!.eta).toBe('08:00 AEDT');
  });
});

describe('dayPlanSheetSlug', () => {
  it('transliterates accents to ASCII', () => {
    expect(dayPlanSheetSlug('Zoë Ñúñez')).toBe('zoe-nunez');
  });

  it('falls back to "inspector" when nothing ASCII remains', () => {
    expect(dayPlanSheetSlug('李雷')).toBe('inspector');
  });
});

describe('DayPlanSheetRenderer — XLSX', () => {
  async function readSheet(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.getWorksheet('Route');
  }

  function cellStrings(ws: ExcelJS.Worksheet, rowNumber: number): string[] {
    const out: string[] = [];
    ws.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell) => out.push(String(cell.value ?? '')));
    return out;
  }

  function findHeaderRow(ws: ExcelJS.Worksheet): number {
    let found = -1;
    ws.eachRow((row, n) => {
      if (found === -1 && String(row.getCell(1).value ?? '') === '#') found = n;
    });
    return found;
  }

  it('writes a "Route" worksheet with the expected header and first data row', async () => {
    const buffer = await makeRenderer().render(makePlan(), 'xlsx');
    const ws = await readSheet(buffer);
    expect(ws).toBeDefined();
    const headerRow = findHeaderRow(ws!);
    expect(headerRow).toBeGreaterThan(0);
    expect(cellStrings(ws!, headerRow)).toEqual(['#', 'Window', 'ETA', 'Address', 'Service', 'Contact', 'Key']);
    expect(cellStrings(ws!, headerRow + 1)).toEqual([
      '1',
      '08:00–17:00',
      '08:00',
      '12 King St, Surry Hills NSW 2010',
      'Routine',
      'Jane Doe · 0412 345 678',
      'No',
    ]);
  });

  it('writes the preamble header block above the table', async () => {
    const buffer = await makeRenderer().render(makePlan(), 'xlsx');
    const ws = await readSheet(buffer);
    const text = JSON.stringify(ws!.getSheetValues());
    for (const label of ['Inspector', 'Date', 'Starting from', 'Finish', 'Drive time']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Date: 05/11/2026');
  });

  it('adds the approximate banner and no out-of-date banner for a fresh approximate plan', async () => {
    const buffer = await makeRenderer().render(makePlan({ approximate: true }), 'xlsx');
    const text = JSON.stringify((await readSheet(buffer))!.getSheetValues());
    expect(text).toContain('Approximate route: some travel times are estimates');
    expect(text).not.toContain('straight-line');
    expect(text).not.toContain('out of date');
  });

  it('adds the out-of-date banner for a STALE plan with the generated timestamp', async () => {
    const buffer = await makeRenderer().render(makePlan({ status: 'STALE' }), 'xlsx');
    const text = JSON.stringify((await readSheet(buffer))!.getSheetValues());
    expect(text).toContain('This route may be out of date (generated 04/11/2026 19:30 AEDT)');
  });

  it('adds the mixed-timezone note only when agencies differ', async () => {
    const single = JSON.stringify((await readSheet(await makeRenderer().render(makePlan(), 'xlsx')))!.getSheetValues());
    expect(single).not.toContain("Times in each agency's local time");

    const perth = makeStop({ sequence: 1, timezone: 'Australia/Perth', eta: '2026-11-05T00:00:00.000Z' });
    const sydney = makeStop({ sequence: 2 });
    const mixed = JSON.stringify(
      (await readSheet(await makeRenderer().render(makePlan({ stops: [perth, sydney] }), 'xlsx')))!.getSheetValues(),
    );
    expect(mixed).toContain("Times in each agency's local time");
  });

  it('contains no raw UUID anywhere in the sheet', async () => {
    const buffer = await makeRenderer().render(makePlan(), 'xlsx');
    const text = JSON.stringify((await readSheet(buffer))!.getSheetValues());
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('DayPlanSheetRenderer — PDF', () => {
  it('produces a PDF that starts with the %PDF signature', async () => {
    const buffer = await makeRenderer().render(makePlan(), 'pdf');
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('passes the same rows the XLSX path builds to the PDF generator', async () => {
    const plan = makePlan();
    const pdf: IDayPlanSheetPdfGenerator = { render: vi.fn().mockResolvedValue(Buffer.from('%PDF-stub')) };
    await makeRenderer(pdf).render(plan, 'pdf');
    expect(pdf.render).toHaveBeenCalledTimes(1);
    const arg = (pdf.render as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.rows).toEqual(buildDayPlanSheetRows(plan));
  });

  it('paginates 25 stops without throwing', async () => {
    const stops = Array.from({ length: 25 }, (_, i) =>
      makeStop({ appointmentId: `${i}`.padStart(8, '0') + '-0000-4000-8000-000000000000', sequence: i + 1 }),
    );
    const buffer = await makeRenderer().render(makePlan({ stops }), 'pdf');
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
