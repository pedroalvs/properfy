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

    const rows = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
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

  it('ignores an unmapped, non-CUSTOM header', async () => {
    const csv = ['Type,Some Unknown Column', 'Routine Inspection,whatever'].join('\n');
    const rows = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
    expect(rows[0]!.serviceTypeName).toBe('Routine Inspection');
    expect(rows[0]!.customFieldCandidates).toEqual([]);
  });

  it('preserves multiple CUSTOM: columns in column order', async () => {
    const csv = [
      'Type,CUSTOM: Alarm Code,CUSTOM: Parking',
      'Routine Inspection,1234,Space 12',
    ].join('\n');
    const rows = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
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
    const rows = await parseAppointmentImportFile(Buffer.from(csv), 'csv');
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
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.postcode).toBe(800);
    expect(typeof rows[0]!.postcode).toBe('number');
    expect(rows[0]!.primaryContactPhone).toBe(412345678);
    expect(typeof rows[0]!.primaryContactPhone).toBe('number');
  });

  it('preserves a date-typed cell as a Date object, not a stringified value', async () => {
    const buffer = await buildXlsxBuffer(['Type', 'Date'], [['Routine Inspection', new Date('2027-06-20')]]);
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.scheduledDate).toBeInstanceOf(Date);
  });

  it('preserves a string cell as a string', async () => {
    const buffer = await buildXlsxBuffer(['Type', 'Street'], [['Routine Inspection', '3/18 Ocean St']]);
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.street).toBe('3/18 Ocean St');
  });

  it('trims surrounding whitespace on header names before mapping', async () => {
    const buffer = await buildXlsxBuffer([' Type ', 'Street'], [['Routine Inspection', '1 Main St']]);
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.serviceTypeName).toBe('Routine Inspection');
  });

  it('captures a CUSTOM: column from xlsx headers too, in column order', async () => {
    const buffer = await buildXlsxBuffer(
      ['Type', 'CUSTOM: Complete Property Address', 'CUSTOM: Access Instructions'],
      [['Routine Inspection', '3/18 Ocean St Kogarah', 'Ring buzzer 3']],
    );
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.customFieldCandidates).toEqual([
      { label: 'Complete Property Address', rawValue: '3/18 Ocean St Kogarah' },
      { label: 'Access Instructions', rawValue: 'Ring buzzer 3' },
    ]);
  });

  it('returns an empty array for an empty worksheet', async () => {
    const buffer = await buildXlsxBuffer(['Type'], []);
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows).toEqual([]);
  });

  it('defaults every unmapped internal field to null', async () => {
    const buffer = await buildXlsxBuffer(['Type'], [['Routine Inspection']]);
    const rows = await parseAppointmentImportFile(buffer, 'xlsx');
    expect(rows[0]!.street).toBeNull();
    expect(rows[0]!.primaryContactEmail).toBeNull();
    expect(rows[0]!.customFieldCandidates).toEqual([]);
  });
});
