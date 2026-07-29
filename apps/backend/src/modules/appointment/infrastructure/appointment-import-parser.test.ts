import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseAppointmentImportFile,
  APPOINTMENT_IMPORT_HEADER_MAP,
} from './appointment-import-parser';

async function buildXlsxBuffer(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Appointments');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('APPOINTMENT_IMPORT_HEADER_MAP', () => {
  it('maps every real spreadsheet header to an internal field', () => {
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Type']).toBe('serviceTypeName');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Date']).toBe('scheduledDate');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Start Time']).toBe('timeSlotStart');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['End Time']).toBe('timeSlotEnd');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Street']).toBe('street');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Suburb']).toBe('suburb');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['State']).toBe('state');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Postcode']).toBe('postcode');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Country']).toBe('country');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Address line 2']).toBe('addressLine2');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Apartment']).toBe('apartmentNumber');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Notes']).toBe('notes');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Realty description']).toBe('realtyDescription');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Tenant name']).toBe('primaryContactName');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Tenant mail']).toBe('primaryContactEmail');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['Tenant phone']).toBe('primaryContactPhone');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['EMAIL: Tenant secondary mail']).toBe('secondaryEmail');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['PHONE: Tenant secondary phone']).toBe('secondaryPhone');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['EMAIL: Tenant tertiary mail']).toBe('tertiaryEmail');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['PHONE: Tenant tertiary phone']).toBe('tertiaryPhone');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['EMAIL: Tenant quaternary mail']).toBe('quaternaryEmail');
    expect(APPOINTMENT_IMPORT_HEADER_MAP['PHONE: Tenant quaternary phone']).toBe('quaternaryPhone');
  });

  it('does NOT statically map the CUSTOM: convention — that is a dynamic rule', () => {
    expect(APPOINTMENT_IMPORT_HEADER_MAP['CUSTOM: Complete Property Address']).toBeUndefined();
  });
});

describe('parseAppointmentImportFile — CSV', () => {
  it('maps static headers and captures a CUSTOM: column as a candidate', async () => {
    const csv = [
      'Type,Tenant name,Tenant mail,Tenant phone,CUSTOM: Complete Property Address',
      'Routine Inspection,Jane Smith,jane@example.com,0412345678,3/18 Ocean St Kogarah',
    ].join('\n');

    const { rows } = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.serviceTypeName).toBe('Routine Inspection');
    expect(row.primaryContactName).toBe('Jane Smith');
    expect(row.primaryContactEmail).toBe('jane@example.com');
    expect(row.primaryContactPhone).toBe('0412345678');
    expect(row.customFieldCandidates).toEqual([
      { label: 'Complete Property Address', rawValue: '3/18 Ocean St Kogarah' },
    ]);
  });

  it('maps the optional Apartment column, and leaves it null when the column is absent', async () => {
    const withColumn = await parseAppointmentImportFile(
      Buffer.from(['Type,Apartment', 'Routine Inspection,4'].join('\n')),
      'csv',
    );
    expect(withColumn.rows[0]!.apartmentNumber).toBe('4');

    const withoutColumn = await parseAppointmentImportFile(
      Buffer.from(['Type', 'Routine Inspection'].join('\n')),
      'csv',
    );
    expect(withoutColumn.rows[0]!.apartmentNumber).toBeNull();
  });

  it('ignores an unmapped, non-CUSTOM header', async () => {
    const csv = ['Type,Some Unknown Column', 'Routine Inspection,whatever'].join('\n');
    const { rows } = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
    expect(rows[0]!.serviceTypeName).toBe('Routine Inspection');
    expect(rows[0]!.customFieldCandidates).toEqual([]);
  });

  it('preserves multiple CUSTOM: columns in column order', async () => {
    const csv = [
      'Type,CUSTOM: Alarm Code,CUSTOM: Parking',
      'Routine Inspection,1234,Space 12',
    ].join('\n');
    const { rows } = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
    expect(rows[0]!.customFieldCandidates).toEqual([
      { label: 'Alarm Code', rawValue: '1234' },
      { label: 'Parking', rawValue: 'Space 12' },
    ]);
  });

  it('parses multiple data rows', async () => {
    const csv = [
      'Type,Tenant name',
      'Routine Inspection,Row One',
      'Ingoing Inspection,Row Two',
    ].join('\n');
    const { rows } = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.primaryContactName).toBe('Row One');
    expect(rows[1]!.primaryContactName).toBe('Row Two');
  });
});

describe('parseAppointmentImportFile — XLSX (type preservation)', () => {
  it('preserves a numeric cell as a number (postcode/phone stored without a leading zero)', async () => {
    const buffer = await buildXlsxBuffer(
      ['Type', 'Postcode', 'Tenant phone'],
      [['Routine Inspection', 800, 412345678]],
    );
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.postcode).toBe(800);
    expect(typeof rows[0]!.postcode).toBe('number');
    expect(rows[0]!.primaryContactPhone).toBe(412345678);
    expect(typeof rows[0]!.primaryContactPhone).toBe('number');
  });

  it('preserves a numeric Apartment cell as a number', async () => {
    const buffer = await buildXlsxBuffer(['Type', 'Apartment'], [['Routine Inspection', 4]]);
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.apartmentNumber).toBe(4);
  });

  it('preserves a date-typed cell as a Date object, not a stringified value', async () => {
    const buffer = await buildXlsxBuffer(['Type', 'Date'], [['Routine Inspection', new Date('2027-06-20')]]);
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.scheduledDate).toBeInstanceOf(Date);
  });

  it('preserves a string cell as a string', async () => {
    const buffer = await buildXlsxBuffer(['Type', 'Street'], [['Routine Inspection', '3/18 Ocean St']]);
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.street).toBe('3/18 Ocean St');
  });

  it('trims surrounding whitespace on header names before mapping', async () => {
    const buffer = await buildXlsxBuffer([' Type ', 'Street'], [['Routine Inspection', '1 Main St']]);
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.serviceTypeName).toBe('Routine Inspection');
  });

  it('captures a CUSTOM: column from xlsx headers too, in column order', async () => {
    const buffer = await buildXlsxBuffer(
      ['Type', 'CUSTOM: Complete Property Address', 'CUSTOM: Access Instructions'],
      [['Routine Inspection', '3/18 Ocean St Kogarah', 'Ring buzzer 3']],
    );
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.customFieldCandidates).toEqual([
      { label: 'Complete Property Address', rawValue: '3/18 Ocean St Kogarah' },
      { label: 'Access Instructions', rawValue: 'Ring buzzer 3' },
    ]);
  });

  it('returns an empty array for an empty worksheet', async () => {
    const buffer = await buildXlsxBuffer(['Type'], []);
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows).toEqual([]);
  });

  it('defaults every unmapped internal field to null', async () => {
    const buffer = await buildXlsxBuffer(['Type'], [['Routine Inspection']]);
    const { rows } = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.street).toBeNull();
    expect(rows[0]!.primaryContactEmail).toBeNull();
    expect(rows[0]!.customFieldCandidates).toEqual([]);
  });
});

async function buildMultiSheetXlsxBuffer(
  sheets: Array<{ name: string; state?: 'visible' | 'hidden'; rows: unknown[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name);
    if (spec.state === 'hidden') sheet.state = 'hidden';
    for (const row of spec.rows) sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const DATA_HEADERS = ['Type', 'Street', 'Suburb', 'State', 'Postcode'];
const DATA_ROW = ['Routine Inspection', '1 Main St', 'Kogarah', 'NSW', '2217'];

describe('parseAppointmentImportFile — file-level rejection', () => {
  it.each(['xlsx', 'csv'] as const)('rejects an empty %s file', async (ext) => {
    await expect(parseAppointmentImportFile(Buffer.alloc(0), ext)).rejects.toMatchObject({
      code: 'IMPORT_FILE_EMPTY',
      statusCode: 400,
    });
  });

  it('rejects a CSV renamed to .xlsx', async () => {
    const csv = Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n');
    await expect(parseAppointmentImportFile(csv, 'xlsx')).rejects.toMatchObject({
      code: 'IMPORT_FILE_CONTENT_MISMATCH',
      statusCode: 400,
    });
  });

  it('rejects a workbook renamed to .csv', async () => {
    const buffer = await buildXlsxBuffer(DATA_HEADERS, [DATA_ROW]);
    await expect(parseAppointmentImportFile(buffer, 'csv')).rejects.toMatchObject({
      code: 'IMPORT_FILE_CONTENT_MISMATCH',
    });
  });

  it('rejects a PDF renamed to .xlsx', async () => {
    await expect(
      parseAppointmentImportFile(Buffer.from('%PDF-1.7\nnot a spreadsheet'), 'xlsx'),
    ).rejects.toMatchObject({ code: 'IMPORT_FILE_CONTENT_MISMATCH' });
  });

  // Valid zip magic, garbage inside — so the byte sniff passes and exceljs is
  // the one that fails. This is exactly the case that returns a 500 today.
  it('rejects a corrupted .xlsx as a 400, not an unhandled error', async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('x'.repeat(256)),
    ]);
    await expect(parseAppointmentImportFile(corrupt, 'xlsx')).rejects.toMatchObject({
      code: 'IMPORT_FILE_CORRUPT_XLSX',
      statusCode: 400,
    });
  });

  it('rejects a truncated .xlsx', async () => {
    const buffer = await buildXlsxBuffer(DATA_HEADERS, [DATA_ROW]);
    await expect(
      parseAppointmentImportFile(buffer.subarray(0, 200), 'xlsx'),
    ).rejects.toMatchObject({ code: 'IMPORT_FILE_CORRUPT_XLSX' });
  });

  it('rejects a CSV with an unclosed quote', async () => {
    const csv = Buffer.from('Type,Street\n"Routine Inspection,1 Main St\n');
    await expect(parseAppointmentImportFile(csv, 'csv')).rejects.toMatchObject({
      code: 'IMPORT_FILE_CORRUPT_CSV',
      statusCode: 400,
    });
  });

  it('rejects a CSV whose rows have inconsistent column counts', async () => {
    const csv = Buffer.from('Type,Street\nRoutine Inspection,1 Main St,extra\n');
    await expect(parseAppointmentImportFile(csv, 'csv')).rejects.toMatchObject({
      code: 'IMPORT_FILE_CORRUPT_CSV',
    });
  });

  it('rejects a workbook with no worksheets', async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseAppointmentImportFile(buffer, 'xlsx')).rejects.toMatchObject({
      code: 'IMPORT_FILE_NO_WORKSHEETS',
    });
  });

  it('rejects a whitespace-only CSV', async () => {
    await expect(parseAppointmentImportFile(Buffer.from('   \n\n'), 'csv')).rejects.toMatchObject({
      code: 'IMPORT_FILE_NO_HEADER_ROW',
    });
  });

  it('rejects a workbook whose only sheet is empty', async () => {
    const buffer = await buildMultiSheetXlsxBuffer([{ name: 'Blank', rows: [] }]);
    await expect(parseAppointmentImportFile(buffer, 'xlsx')).rejects.toMatchObject({
      code: 'IMPORT_FILE_NO_HEADER_ROW',
    });
  });
});

describe('parseAppointmentImportFile — BOM handling', () => {
  // Excel-for-Windows "Save as CSV UTF-8" writes a BOM. Without `bom: true`
  // the first header parses as U+FEFF + "Type", silently dropping that column —
  // and, once the required-column gate exists, falsely reporting Type missing.
  it('strips a UTF-8 BOM so the first column is not lost', async () => {
    const csv = Buffer.concat([
      Buffer.from('\uFEFF'),
      Buffer.from('Type,Street\nRoutine Inspection,1 Main St\n'),
    ]);
    const parsed = await parseAppointmentImportFile(csv, 'csv');
    expect(parsed.headers[0]).toBe('Type');
    expect(parsed.rows[0]!.serviceTypeName).toBe('Routine Inspection');
  });
});

describe('parseAppointmentImportFile — sheet selection', () => {
  it('reports the single sheet used and nothing ignored', async () => {
    const buffer = await buildXlsxBuffer(DATA_HEADERS, [DATA_ROW]);
    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(parsed.sheetUsed).toBe('Appointments');
    expect(parsed.sheetsIgnored).toEqual([]);
    expect(parsed.headerRowNumber).toBe(1);
  });

  it('skips a cover sheet and reads the first sheet with real headers', async () => {
    const buffer = await buildMultiSheetXlsxBuffer([
      { name: 'Instructions', rows: [['How to use this template'], ['Fill in the Data tab']] },
      { name: 'Data', rows: [DATA_HEADERS, DATA_ROW] },
    ]);
    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(parsed.sheetUsed).toBe('Data');
    expect(parsed.sheetsIgnored).toEqual(['Instructions']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.suburb).toBe('Kogarah');
  });

  it('takes the first of two equally valid sheets and reports the rest ignored', async () => {
    const buffer = await buildMultiSheetXlsxBuffer([
      { name: 'January', rows: [DATA_HEADERS, DATA_ROW] },
      { name: 'February', rows: [DATA_HEADERS, DATA_ROW] },
    ]);
    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(parsed.sheetUsed).toBe('January');
    expect(parsed.sheetsIgnored).toEqual(['February']);
    expect(parsed.rows).toHaveLength(1);
  });

  it('prefers a visible data sheet over a hidden one that also has headers', async () => {
    const buffer = await buildMultiSheetXlsxBuffer([
      { name: 'Lookup', state: 'hidden', rows: [DATA_HEADERS, DATA_ROW] },
      { name: 'Appointments', rows: [DATA_HEADERS, DATA_ROW] },
    ]);
    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(parsed.sheetUsed).toBe('Appointments');
    expect(parsed.sheetsIgnored).toEqual(['Lookup']);
  });

  // No sheet qualifies: fall back to the first one so the caller can tell the
  // user exactly which columns their file DOES have.
  it('falls back to the first sheet when none has recognizable headers', async () => {
    const buffer = await buildMultiSheetXlsxBuffer([
      { name: 'Sheet1', rows: [['Property', 'Owner'], ['x', 'y']] },
      { name: 'Sheet2', rows: [['Nonsense'], ['z']] },
    ]);
    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(parsed.sheetUsed).toBe('Sheet1');
    expect(parsed.headers).toEqual(['Property', 'Owner']);
  });

  it('reports the real header row when blank rows pad the top of the sheet', async () => {
    const buffer = await buildMultiSheetXlsxBuffer([
      { name: 'Data', rows: [[], [], DATA_HEADERS, DATA_ROW] },
    ]);
    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(parsed.headerRowNumber).toBe(3);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.street).toBe('1 Main St');
  });
});

describe('parseAppointmentImportFile — headers', () => {
  it('reports the CSV headers in column order', async () => {
    const parsed = await parseAppointmentImportFile(
      Buffer.from('Type,Street,Bogus\nRoutine Inspection,1 Main St,x\n'),
      'csv',
    );
    expect(parsed.headers).toEqual(['Type', 'Street', 'Bogus']);
    expect(parsed.headerRowNumber).toBe(1);
    expect(parsed.sheetUsed).toBeNull();
  });

  it('reports headers for a header-only CSV with no data rows', async () => {
    const parsed = await parseAppointmentImportFile(Buffer.from('Type,Street\n'), 'csv');
    expect(parsed.headers).toEqual(['Type', 'Street']);
    expect(parsed.rows).toEqual([]);
  });
});

describe('parseAppointmentImportFile — gapped header row', () => {
  /**
   * exceljs `eachCell` SKIPS absent cells, so a header row with a gap (someone
   * cleared B1 while B2 still holds data) yields a sparse array with a hole.
   * `for...of` in analyzeImportHeaders then hands `undefined` to `.trim()` —
   * a raw TypeError, i.e. the exact 500 this whole feature exists to remove.
   */
  async function buildGappedHeaderXlsx(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.getCell('A1').value = 'Type';
    // B1 deliberately left empty.
    sheet.getCell('C1').value = 'Street';
    sheet.getCell('D1').value = 'Suburb';
    sheet.getCell('E1').value = 'State';
    sheet.getCell('F1').value = 'Postcode';
    sheet.getCell('A2').value = 'Routine Inspection';
    sheet.getCell('B2').value = 'orphan value under the empty header';
    sheet.getCell('C2').value = '1 Main St';
    sheet.getCell('D2').value = 'Kogarah';
    sheet.getCell('E2').value = 'NSW';
    sheet.getCell('F2').value = '2217';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it('parses a header row with an empty column instead of throwing', async () => {
    const parsed = await parseAppointmentImportFile(await buildGappedHeaderXlsx(), 'xlsx');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.serviceTypeName).toBe('Routine Inspection');
    expect(parsed.rows[0]!.street).toBe('1 Main St');
  });

  it('returns a dense header array, so consumers can iterate it safely', async () => {
    const parsed = await parseAppointmentImportFile(await buildGappedHeaderXlsx(), 'xlsx');

    expect(parsed.headers).toEqual(['Type', '', 'Street', 'Suburb', 'State', 'Postcode']);
    // No holes: every index is an own property.
    for (let i = 0; i < parsed.headers.length; i += 1) {
      expect(i in parsed.headers).toBe(true);
      expect(typeof parsed.headers[i]).toBe('string');
    }
    expect(() => parsed.headers.forEach((h) => h.trim())).not.toThrow();
  });
});

describe('parseAppointmentImportFile — fallback sheet visibility', () => {
  // When no sheet has recognizable headers we still have to pick one, so the
  // user can be told which columns their file DOES have. Naming a hidden sheet
  // they cannot open makes that message useless.
  it('falls back to the first VISIBLE sheet, not a hidden one that happens to be first', async () => {
    const workbook = new ExcelJS.Workbook();
    const hidden = workbook.addWorksheet('Lookup');
    hidden.state = 'hidden';
    hidden.addRow(['Ref', 'Value']);
    hidden.addRow(['a', 'b']);
    const visible = workbook.addWorksheet('Sheet1');
    visible.addRow(['Property', 'Owner']);
    visible.addRow(['x', 'y']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseAppointmentImportFile(buffer, 'xlsx');

    expect(parsed.sheetUsed).toBe('Sheet1');
    expect(parsed.headers).toEqual(['Property', 'Owner']);
  });
});
