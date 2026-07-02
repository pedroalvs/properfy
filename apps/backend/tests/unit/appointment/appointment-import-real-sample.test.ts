/**
 * End-to-end sanity check reproducing the shape of a real agency export
 * (the file that motivated this whole redesign) without using it directly.
 * Proves the parser + normalizer combination survives real-world messiness:
 * Excel-serial dates, numeric phones/postcodes missing their leading 0,
 * multi-person "Tenant name" strings, and a `CUSTOM: Complete Property
 * Address` column — including the one incomplete row (missing phone) a real
 * export had.
 *
 * Fixture: tests/fixtures/appointment-import/sample-agency-export.xlsx is a
 * synthetic file (fake names/emails/phones/addresses, generated to match the
 * real export's structure and edge cases) — no real tenant PII.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAppointmentImportFile } from '../../../src/modules/appointment/infrastructure/appointment-import-parser';
import { normalizeImportRow, type RawImportRow } from '../../../src/modules/appointment/domain/appointment-import-normalize';

const FIXTURE_PATH = resolve(__dirname, '../../fixtures/appointment-import/sample-agency-export.xlsx');
const IMPORT_DAY = '2027-01-01';

describe('real sample agency export', () => {
  let rawRows: RawImportRow[];

  beforeAll(async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    rawRows = await parseAppointmentImportFile(buffer, 'xlsx');
  });

  it('parses every data row (48-row sheet = 1 header + 47 data rows)', () => {
    expect(rawRows.length).toBe(47);
  });

  it('converts every row\'s Excel-serial Date to a valid YYYY-MM-DD without throwing', () => {
    for (const raw of rawRows) {
      const { normalized } = normalizeImportRow(raw, IMPORT_DAY);
      expect(normalized.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('restores a leading 0 on numeric-stored phone numbers', () => {
    const withPhone = rawRows.filter((r) => r.primaryContactPhone != null);
    expect(withPhone.length).toBeGreaterThan(0);
    for (const raw of withPhone) {
      const { normalized } = normalizeImportRow(raw, IMPORT_DAY);
      expect(normalized.primaryContact.phone).toMatch(/^0\d{9}$/);
    }
  });

  it('normalizes every numeric postcode to a 4-digit string', () => {
    for (const raw of rawRows) {
      const { normalized } = normalizeImportRow(raw, IMPORT_DAY);
      expect(normalized.postcode).toMatch(/^\d{4}$/);
    }
  });

  it('keeps a multi-person Tenant name whole on the primary contact', () => {
    const multiPerson = rawRows.find((r) => typeof r.primaryContactName === 'string' && r.primaryContactName.includes(','));
    expect(multiPerson).toBeDefined();
    const { normalized } = normalizeImportRow(multiPerson!, IMPORT_DAY);
    expect(normalized.primaryContact.name).toBe(multiPerson!.primaryContactName);
  });

  it('captures the sheet\'s own CUSTOM: Complete Property Address column as a custom field on every row', () => {
    for (const raw of rawRows) {
      expect(raw.customFieldCandidates).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: 'Complete Property Address' })]),
      );
    }
    const { normalized } = normalizeImportRow(rawRows[0]!, IMPORT_DAY);
    expect(normalized.customFields).toEqual([
      expect.objectContaining({ label: 'Complete Property Address' }),
    ]);
  });

  it('every row has a usable street/suburb/state/postcode (no address-required errors expected downstream)', () => {
    for (const raw of rawRows) {
      const { normalized } = normalizeImportRow(raw, IMPORT_DAY);
      expect(normalized.street).toBeTruthy();
      expect(normalized.suburb).toBeTruthy();
      expect(normalized.state).toBeTruthy();
      expect(normalized.postcode).toBeTruthy();
    }
  });

  it('most rows have a complete primary contact — one known gap (row 13, no phone)', () => {
    // This is exactly the scenario the resolver's CONTACT_INCOMPLETE error
    // exists for: row 13 has no phone number in the source spreadsheet. It
    // will be reported as a per-row error in the preview and excluded from
    // commit — the other 46 rows still import.
    const incomplete = rawRows
      .map((raw, i) => ({ rowNumber: i + 2, contact: normalizeImportRow(raw, IMPORT_DAY).normalized.primaryContact }))
      .filter(({ contact }) => !contact.name || !contact.email || !contact.phone);

    expect(incomplete.map((r) => r.rowNumber)).toEqual([13]);
    expect(rawRows.length - incomplete.length).toBe(46);
  });
});
