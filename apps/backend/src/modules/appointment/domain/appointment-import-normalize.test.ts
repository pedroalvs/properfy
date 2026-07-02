import { describe, it, expect } from 'vitest';
import {
  normalizeScheduledDate,
  normalizeTimeSlot,
  normalizePostcode,
  normalizePhoneAU,
  deriveContactNameFromEmail,
  normalizeImportRow,
  type RawImportRow,
} from './appointment-import-normalize';

const IMPORT_DAY = '2027-06-15';

describe('normalizeScheduledDate', () => {
  it('passes through an ISO YYYY-MM-DD string', () => {
    const result = normalizeScheduledDate('2027-05-01', IMPORT_DAY);
    expect(result).toEqual({ date: '2027-05-01', defaulted: false });
  });

  it('converts an Excel serial number to YYYY-MM-DD', () => {
    // Serial 46000 = 2025-12-09 (1899-12-30 epoch + 46000 days).
    const result = normalizeScheduledDate(46000, IMPORT_DAY);
    expect(result.date).toBe('2025-12-09');
    expect(result.defaulted).toBe(false);
  });

  it('converts the sample file serial 46244 correctly', () => {
    // Cross-check against the real sample spreadsheet's first data row.
    const result = normalizeScheduledDate(46244, IMPORT_DAY);
    expect(result.date).toBe('2026-08-10');
  });

  it('formats a JS Date value directly (exceljs date-typed cell)', () => {
    const result = normalizeScheduledDate(new Date(Date.UTC(2027, 5, 20)), IMPORT_DAY);
    expect(result.date).toBe('2027-06-20');
  });

  it('defaults to the import day and warns when the cell is empty', () => {
    const result = normalizeScheduledDate('', IMPORT_DAY);
    expect(result.date).toBe(IMPORT_DAY);
    expect(result.defaulted).toBe(true);
  });

  it('defaults to the import day and warns when the cell is null', () => {
    const result = normalizeScheduledDate(null, IMPORT_DAY);
    expect(result.date).toBe(IMPORT_DAY);
    expect(result.defaulted).toBe(true);
  });

  it('defaults when the value is an unparseable string', () => {
    const result = normalizeScheduledDate('not a date', IMPORT_DAY);
    expect(result.date).toBe(IMPORT_DAY);
    expect(result.defaulted).toBe(true);
  });
});

describe('normalizeTimeSlot', () => {
  it('passes through valid HH:mm strings', () => {
    const result = normalizeTimeSlot('09:00', '10:30');
    expect(result).toEqual({ start: '09:00', end: '10:30', defaulted: false });
  });

  it('defaults to 08:00-17:00 when both are empty', () => {
    const result = normalizeTimeSlot('', '');
    expect(result).toEqual({ start: '08:00', end: '17:00', defaulted: true });
  });

  it('defaults to 08:00-17:00 when null', () => {
    const result = normalizeTimeSlot(null, null);
    expect(result.start).toBe('08:00');
    expect(result.end).toBe('17:00');
    expect(result.defaulted).toBe(true);
  });

  it('defaults when only start is given (partial pair treated as malformed)', () => {
    const result = normalizeTimeSlot('09:00', '');
    expect(result).toEqual({ start: '08:00', end: '17:00', defaulted: true });
  });

  it('defaults when start is not before end', () => {
    const result = normalizeTimeSlot('17:00', '09:00');
    expect(result.defaulted).toBe(true);
  });

  it('defaults on malformed HH:mm values', () => {
    const result = normalizeTimeSlot('9am', '5pm');
    expect(result.defaulted).toBe(true);
  });
});

describe('normalizePostcode', () => {
  it('left-pads a numeric postcode to 4 digits', () => {
    expect(normalizePostcode(800)).toBe('0800');
  });

  it('leaves an already-padded numeric string alone', () => {
    expect(normalizePostcode('2217')).toBe('2217');
  });

  it('trims a string postcode', () => {
    expect(normalizePostcode('  2217 ')).toBe('2217');
  });

  it('returns null for empty input', () => {
    expect(normalizePostcode('')).toBeNull();
    expect(normalizePostcode(null)).toBeNull();
  });
});

describe('normalizePhoneAU', () => {
  it('restores a leading 0 lost when the cell was stored as a number (mobile)', () => {
    const result = normalizePhoneAU(412345678);
    expect(result.value).toBe('0412345678');
    expect(result.normalized).toBe(true);
  });

  it('restores a leading 0 for a 9-digit landline', () => {
    const result = normalizePhoneAU(298765432);
    expect(result.value).toBe('0298765432');
    expect(result.normalized).toBe(true);
  });

  it('converts a +61-prefixed international number to local 0-prefixed form', () => {
    const result = normalizePhoneAU('+61412345678');
    expect(result.value).toBe('0412345678');
    expect(result.normalized).toBe(true);
  });

  it('leaves an already-correct 10-digit local number untouched', () => {
    const result = normalizePhoneAU('0412345678');
    expect(result.value).toBe('0412345678');
    expect(result.normalized).toBe(false);
  });

  it('returns null for empty input', () => {
    expect(normalizePhoneAU('').value).toBeNull();
    expect(normalizePhoneAU(null).value).toBeNull();
  });
});

describe('deriveContactNameFromEmail', () => {
  it('title-cases a dot-separated local part', () => {
    expect(deriveContactNameFromEmail('jane.doe@example.com')).toBe('Jane Doe');
  });

  it('handles underscores and plus signs as separators', () => {
    expect(deriveContactNameFromEmail('john_smith+tag@example.com')).toBe('John Smith Tag');
  });

  it('returns null for an empty/invalid email', () => {
    expect(deriveContactNameFromEmail('')).toBeNull();
    expect(deriveContactNameFromEmail(null)).toBeNull();
  });
});

function baseRow(overrides: Partial<RawImportRow> = {}): RawImportRow {
  return {
    serviceTypeName: 'Routine Inspection',
    scheduledDate: '2027-06-20',
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    street: '3/18 Ocean St',
    addressLine2: null,
    suburb: 'Kogarah',
    state: 'NSW',
    postcode: 2217,
    country: 'Australia',
    notes: null,
    realtyDescription: null,
    primaryContactName: 'Jeanette Rojas',
    primaryContactEmail: 'jeanette.rojas31@gmail.com',
    primaryContactPhone: 412345678,
    secondaryEmail: null,
    secondaryPhone: null,
    tertiaryEmail: null,
    tertiaryPhone: null,
    quaternaryEmail: null,
    quaternaryPhone: null,
    customFieldCandidates: [],
    ...overrides,
  };
}

describe('normalizeImportRow', () => {
  it('normalizes a fully-populated row with no warnings besides phone re-padding', () => {
    const { normalized, issues } = normalizeImportRow(baseRow(), IMPORT_DAY);
    expect(normalized.serviceTypeName).toBe('Routine Inspection');
    expect(normalized.scheduledDate).toBe('2027-06-20');
    expect(normalized.scheduledDateDefaulted).toBe(false);
    expect(normalized.timeSlotStart).toBe('09:00');
    expect(normalized.timeSlotEnd).toBe('10:00');
    expect(normalized.timeDefaulted).toBe(false);
    expect(normalized.street).toBe('3/18 Ocean St');
    expect(normalized.postcode).toBe('2217');
    expect(normalized.primaryContact).toEqual({
      name: 'Jeanette Rojas', email: 'jeanette.rojas31@gmail.com', phone: '0412345678', nameDerived: false,
    });
    expect(normalized.additionalChannelCandidates).toEqual([]);
    expect(normalized.customFields).toEqual([]);
    expect(issues.some((i) => i.code === 'PHONE_NORMALIZED')).toBe(true);
  });

  it('defaults date and time and reports both as warnings', () => {
    const { normalized, issues } = normalizeImportRow(baseRow({ scheduledDate: '', timeSlotStart: '', timeSlotEnd: '' }), IMPORT_DAY);
    expect(normalized.scheduledDate).toBe(IMPORT_DAY);
    expect(normalized.scheduledDateDefaulted).toBe(true);
    expect(normalized.timeSlotStart).toBe('08:00');
    expect(normalized.timeSlotEnd).toBe('17:00');
    expect(normalized.timeDefaulted).toBe(true);
    expect(issues.find((i) => i.code === 'DEFAULT_APPLIED_DATE')?.severity).toBe('warning');
    expect(issues.find((i) => i.code === 'DEFAULT_APPLIED_TIME')?.severity).toBe('warning');
  });

  it('derives the primary contact name from the email local part when the name is blank', () => {
    const { normalized, issues } = normalizeImportRow(baseRow({ primaryContactName: '' }), IMPORT_DAY);
    expect(normalized.primaryContact.name).toBe('Jeanette Rojas31');
    expect(normalized.primaryContact.nameDerived).toBe(true);
    expect(issues.some((i) => i.code === 'CONTACT_NAME_DERIVED')).toBe(true);
  });

  it('builds an additional-channel candidate per non-empty secondary/tertiary/quaternary value', () => {
    const { normalized } = normalizeImportRow(
      baseRow({ secondaryEmail: 'second@example.com', secondaryPhone: 400000001, tertiaryEmail: 'third@example.com' }),
      IMPORT_DAY,
    );
    expect(normalized.additionalChannelCandidates).toEqual(
      expect.arrayContaining([
        { channel: 'EMAIL', value: 'second@example.com', label: 'Secondary' },
        { channel: 'PHONE', value: '0400000001', label: 'Secondary' },
        { channel: 'EMAIL', value: 'third@example.com', label: 'Tertiary' },
      ]),
    );
  });

  it('drops an additional channel that duplicates the primary email, with a warning', () => {
    const { normalized, issues } = normalizeImportRow(
      baseRow({ secondaryEmail: 'jeanette.rojas31@gmail.com' }),
      IMPORT_DAY,
    );
    expect(normalized.additionalChannelCandidates).toEqual([]);
    expect(issues.some((i) => i.code === 'CHANNEL_DUPLICATES_PRIMARY')).toBe(true);
  });

  it('drops a channel that duplicates an earlier candidate, with a warning', () => {
    const { normalized, issues } = normalizeImportRow(
      baseRow({ secondaryEmail: 'dup@example.com', tertiaryEmail: 'dup@example.com' }),
      IMPORT_DAY,
    );
    expect(normalized.additionalChannelCandidates).toEqual([
      { channel: 'EMAIL', value: 'dup@example.com', label: 'Secondary' },
    ]);
    expect(issues.some((i) => i.code === 'CHANNEL_DUPLICATE')).toBe(true);
  });

  it('flags a partial pair (email only, no phone) as a warning but keeps the channel', () => {
    const { normalized, issues } = normalizeImportRow(
      baseRow({ secondaryEmail: 'onlyemail@example.com' }),
      IMPORT_DAY,
    );
    expect(normalized.additionalChannelCandidates).toEqual([
      { channel: 'EMAIL', value: 'onlyemail@example.com', label: 'Secondary' },
    ]);
    expect(issues.some((i) => i.code === 'CONTACT_PARTIAL')).toBe(true);
  });

  it('caps custom fields at 4 and warns about the rest, in column order', () => {
    const { normalized, issues } = normalizeImportRow(
      baseRow({
        customFieldCandidates: [
          { label: 'A', rawValue: '1' },
          { label: 'B', rawValue: '2' },
          { label: 'C', rawValue: '3' },
          { label: 'D', rawValue: '4' },
          { label: 'E', rawValue: '5' },
        ],
      }),
      IMPORT_DAY,
    );
    expect(normalized.customFields).toEqual([
      { label: 'A', value: '1' }, { label: 'B', value: '2' }, { label: 'C', value: '3' }, { label: 'D', value: '4' },
    ]);
    expect(normalized.customFieldsTruncated).toBe(true);
    expect(issues.some((i) => i.code === 'CUSTOM_FIELDS_TRUNCATED')).toBe(true);
  });

  it('drops a custom field candidate with an empty value', () => {
    const { normalized } = normalizeImportRow(
      baseRow({ customFieldCandidates: [{ label: 'Key Location', rawValue: '   ' }] }),
      IMPORT_DAY,
    );
    expect(normalized.customFields).toEqual([]);
  });

  it('truncates an over-long custom field label/value and warns', () => {
    const longLabel = 'L'.repeat(60);
    const longValue = 'V'.repeat(600);
    const { normalized, issues } = normalizeImportRow(
      baseRow({ customFieldCandidates: [{ label: longLabel, rawValue: longValue }] }),
      IMPORT_DAY,
    );
    expect(normalized.customFields[0]!.label.length).toBe(50);
    expect(normalized.customFields[0]!.value.length).toBe(500);
    expect(issues.some((i) => i.code === 'CUSTOM_FIELD_TRUNCATED')).toBe(true);
  });

  it('combines Realty description into notes', () => {
    const { normalized } = normalizeImportRow(
      baseRow({ notes: 'Key under mat', realtyDescription: 'Managed by Acme Realty' }),
      IMPORT_DAY,
    );
    expect(normalized.notes).toContain('Key under mat');
    expect(normalized.notes).toContain('Managed by Acme Realty');
  });

  it('normalizes the numeric postcode from the sample file shape', () => {
    const { normalized } = normalizeImportRow(baseRow({ postcode: 800 }), IMPORT_DAY);
    expect(normalized.postcode).toBe('0800');
  });
});
