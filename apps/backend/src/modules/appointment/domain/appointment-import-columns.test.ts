import { describe, it, expect } from 'vitest';
import {
  APPOINTMENT_IMPORT_HEADER_MAP,
  REQUIRED_IMPORT_COLUMNS,
  analyzeImportHeaders,
  isRecognizableHeaderRow,
} from './appointment-import-columns';

/** The header row of the real agency export, verbatim. */
const REAL_SAMPLE_HEADERS = [
  'Type', 'Date', 'Start Time', 'End Time',
  'Street', 'Suburb', 'State', 'Postcode',
  'Tenant name', 'Tenant mail', 'Tenant phone',
  'CUSTOM: Complete Property Address',
];

describe('REQUIRED_IMPORT_COLUMNS', () => {
  // Pinned deliberately: Date / Start Time / End Time are NOT required,
  // because the normalizer applies documented defaults for them. Adding one
  // here would start rejecting files that import fine today.
  it('is exactly the five columns with no default', () => {
    expect([...REQUIRED_IMPORT_COLUMNS]).toEqual(['Type', 'Street', 'Suburb', 'State', 'Postcode']);
  });

  it('only names headers that the header map knows how to map', () => {
    for (const column of REQUIRED_IMPORT_COLUMNS) {
      expect(APPOINTMENT_IMPORT_HEADER_MAP[column]).toBeDefined();
    }
  });
});

describe('analyzeImportHeaders', () => {
  it('accepts the real sample export with nothing missing and nothing unknown', () => {
    const analysis = analyzeImportHeaders(REAL_SAMPLE_HEADERS);
    expect(analysis.missingRequired).toEqual([]);
    expect(analysis.unknown).toEqual([]);
    expect(analysis.custom).toEqual(['Complete Property Address']);
    expect(analysis.recognized).toContain('Type');
  });

  it('reports missing required columns in the canonical order', () => {
    const analysis = analyzeImportHeaders(['Street', 'Type', 'Date']);
    expect(analysis.missingRequired).toEqual(['Suburb', 'State', 'Postcode']);
  });

  it('reports every required column as missing for an unrelated header row', () => {
    const analysis = analyzeImportHeaders(['Property', 'Owner', 'Rent']);
    expect(analysis.missingRequired).toEqual([...REQUIRED_IMPORT_COLUMNS]);
  });

  it('suggests the intended header for a typo', () => {
    const analysis = analyzeImportHeaders(['Type', 'Street', 'Suburb', 'State', 'Postcodee']);
    expect(analysis.unknown).toEqual([{ column: 'Postcodee', suggestion: 'Postcode' }]);
    expect(analysis.missingRequired).toEqual(['Postcode']);
  });

  // Header matching is exact and case-sensitive today. We surface the near
  // miss as a suggestion rather than silently auto-mapping it, which would
  // quietly change the mapping contract.
  it('suggests the correct casing but still counts a miscased header as missing', () => {
    const analysis = analyzeImportHeaders(['Type', 'street', 'Suburb', 'State', 'Postcode']);
    expect(analysis.unknown).toEqual([{ column: 'street', suggestion: 'Street' }]);
    expect(analysis.missingRequired).toEqual(['Street']);
  });

  it('offers no suggestion for a header that resembles nothing', () => {
    const analysis = analyzeImportHeaders([...REAL_SAMPLE_HEADERS, 'Owner phone']);
    expect(analysis.unknown).toEqual([{ column: 'Owner phone', suggestion: null }]);
  });

  it('ignores blank and whitespace-only headers', () => {
    const analysis = analyzeImportHeaders(['Type', '', '   ', 'Street', 'Suburb', 'State', 'Postcode']);
    expect(analysis.unknown).toEqual([]);
    expect(analysis.missingRequired).toEqual([]);
  });

  it('trims headers before matching', () => {
    const analysis = analyzeImportHeaders([' Type ', 'Street', 'Suburb', 'State', 'Postcode']);
    expect(analysis.missingRequired).toEqual([]);
    expect(analysis.recognized).toContain('Type');
  });

  it('treats a CUSTOM: header as custom, never as unknown', () => {
    const analysis = analyzeImportHeaders(['Type', 'Street', 'Suburb', 'State', 'Postcode', 'CUSTOM: Gate code']);
    expect(analysis.custom).toEqual(['Gate code']);
    expect(analysis.unknown).toEqual([]);
  });

  it('preserves column order in recognized and unknown', () => {
    const analysis = analyzeImportHeaders(['Zebra', 'Type', 'Alpha', 'Street']);
    expect(analysis.recognized).toEqual(['Type', 'Street']);
    expect(analysis.unknown.map((u) => u.column)).toEqual(['Zebra', 'Alpha']);
  });
});

describe('isRecognizableHeaderRow', () => {
  it('accepts the real sample header row', () => {
    expect(isRecognizableHeaderRow(REAL_SAMPLE_HEADERS)).toBe(true);
  });

  it('rejects a cover / instructions sheet', () => {
    expect(isRecognizableHeaderRow(['How to use this template', '', ''])).toBe(false);
  });

  it('rejects an empty row', () => {
    expect(isRecognizableHeaderRow([])).toBe(false);
  });

  // Lenient on purpose: a partially-renamed sheet must still be SELECTED so
  // the user gets a precise missing-columns message about it, rather than the
  // parser falling through to a cover tab and complaining about that instead.
  it('accepts a row carrying a single required column', () => {
    expect(isRecognizableHeaderRow(['Street', 'Whatever', 'Nonsense'])).toBe(true);
  });

  it('accepts a row with two recognized non-required columns', () => {
    expect(isRecognizableHeaderRow(['Date', 'Notes'])).toBe(true);
  });

  it('rejects a row with a single non-required recognized column', () => {
    expect(isRecognizableHeaderRow(['Notes', 'Random', 'Stuff'])).toBe(false);
  });
});
