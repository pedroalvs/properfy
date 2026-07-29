import { describe, it, expect } from 'vitest';
import {
  geocodeVerificationSchema,
  importStatusResponseSchema,
  importFileIssueSchema,
  IMPORT_FILE_ISSUE_CODES,
} from './import';

describe('importStatusResponseSchema', () => {
  it('accepts valid import status response', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'COMPLETED',
      totalRows: 50,
      successCount: 48,
      errorCount: 2,
      errors: [
        { row: 5, field: 'email', message: 'Invalid email format' },
        { row: 12, field: 'postcode', message: 'Required field' },
      ],
      createdAt: '2026-03-18T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts response without errors array', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'PROCESSING',
      totalRows: 100,
      successCount: 0,
      errorCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'INVALID',
      totalRows: 0,
      successCount: 0,
      errorCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('geocodeVerificationSchema', () => {
  it('accepts found with coordinates', () => {
    const result = geocodeVerificationSchema.safeParse({ status: 'found', lat: -33.86, lng: 151.2 });
    expect(result.success).toBe(true);
  });

  it('accepts not_found and unverified with null coordinates', () => {
    expect(geocodeVerificationSchema.safeParse({ status: 'not_found', lat: null, lng: null }).success).toBe(true);
    expect(geocodeVerificationSchema.safeParse({ status: 'unverified', lat: null, lng: null }).success).toBe(true);
  });

  it('rejects unknown status values', () => {
    const result = geocodeVerificationSchema.safeParse({ status: 'pending', lat: null, lng: null });
    expect(result.success).toBe(false);
  });

  it('rejects found without coordinates', () => {
    expect(geocodeVerificationSchema.safeParse({ status: 'found', lat: null, lng: null }).success).toBe(false);
    expect(geocodeVerificationSchema.safeParse({ status: 'found', lat: -33.8, lng: null }).success).toBe(false);
  });

  it('rejects not_found/unverified carrying coordinates', () => {
    expect(geocodeVerificationSchema.safeParse({ status: 'not_found', lat: -33.8, lng: 151.2 }).success).toBe(false);
    expect(geocodeVerificationSchema.safeParse({ status: 'unverified', lat: -33.8, lng: 151.2 }).success).toBe(false);
  });
});

describe('importFileIssueSchema', () => {
  it('fills every payload field with a default when only the core keys are given', () => {
    const result = importFileIssueSchema.safeParse({
      code: 'IMPORT_FILE_CORRUPT_XLSX',
      severity: 'error',
      message: 'This .xlsx file could not be opened.',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      code: 'IMPORT_FILE_CORRUPT_XLSX',
      severity: 'error',
      message: 'This .xlsx file could not be opened.',
      missingColumns: [],
      foundColumns: [],
      unknownColumns: [],
      sheetUsed: null,
      sheetsIgnored: [],
    });
  });

  it('carries the structured column payload for a missing-columns issue', () => {
    const result = importFileIssueSchema.safeParse({
      code: 'IMPORT_FILE_MISSING_COLUMNS',
      severity: 'error',
      message: 'This file is missing 2 required columns.',
      missingColumns: ['Suburb', 'Postcode'],
      foundColumns: ['Type', 'Street'],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.missingColumns).toEqual(['Suburb', 'Postcode']);
    expect(result.success && result.data.foundColumns).toEqual(['Type', 'Street']);
  });

  it('carries the sheet payload for a multiple-sheets warning', () => {
    const result = importFileIssueSchema.safeParse({
      code: 'IMPORT_FILE_MULTIPLE_SHEETS',
      severity: 'warning',
      message: 'This workbook has 2 sheets.',
      sheetUsed: 'Appointments',
      sheetsIgnored: ['Instructions'],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sheetUsed).toBe('Appointments');
    expect(result.success && result.data.sheetsIgnored).toEqual(['Instructions']);
  });

  it('carries a nullable did-you-mean suggestion per unknown column', () => {
    const result = importFileIssueSchema.safeParse({
      code: 'IMPORT_FILE_UNKNOWN_COLUMNS',
      severity: 'warning',
      message: '2 columns were not recognized and were ignored.',
      unknownColumns: [
        { column: 'Postcodee', suggestion: 'Postcode' },
        { column: 'Owner phone', suggestion: null },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.unknownColumns).toEqual([
      { column: 'Postcodee', suggestion: 'Postcode' },
      { column: 'Owner phone', suggestion: null },
    ]);
  });

  it('rejects a code outside the known set', () => {
    const result = importFileIssueSchema.safeParse({
      code: 'IMPORT_FILE_WHATEVER',
      severity: 'error',
      message: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('has no duplicate codes', () => {
    expect(new Set(IMPORT_FILE_ISSUE_CODES).size).toBe(IMPORT_FILE_ISSUE_CODES.length);
  });
});
