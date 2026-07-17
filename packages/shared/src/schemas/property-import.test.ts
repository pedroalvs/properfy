import { describe, it, expect } from 'vitest';
import {
  commitPropertyImportSchema,
  propertyImportPreviewResponseSchema,
  resolvedPropertyImportRowSchema,
} from './property-import';

const validPropertyPlan = {
  resolution: 'new',
  propertyId: null,
  propertyCode: 'AGY-PROP-0001',
  street: '1 Test St',
  addressLine2: null,
  suburb: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'Australia',
  duplicateOfRow: null,
  geocode: { status: 'found', lat: -33.86, lng: 151.2 },
};

const validRow = {
  rowNumber: 1,
  severity: 'ready',
  importable: true,
  propertyCode: 'AGY-PROP-0001',
  type: 'HOUSE',
  notes: null,
  property: validPropertyPlan,
  issues: [],
};

describe('resolvedPropertyImportRowSchema', () => {
  it('accepts a valid row with geocode verification', () => {
    const result = resolvedPropertyImportRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('defaults geocode to null when absent from the property plan', () => {
    const { geocode: _geocode, ...planWithoutGeocode } = validPropertyPlan;
    const result = resolvedPropertyImportRowSchema.parse({
      ...validRow,
      property: planWithoutGeocode,
    });
    expect(result.property?.geocode).toBeNull();
  });

  it('accepts a broken row with null property and error issues', () => {
    const result = resolvedPropertyImportRowSchema.safeParse({
      rowNumber: 3,
      severity: 'error',
      importable: false,
      propertyCode: null,
      type: null,
      notes: null,
      property: null,
      issues: [
        { field: 'street', code: 'REQUIRED_FIELD', severity: 'error', message: 'Street is required' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown geocode status', () => {
    const result = resolvedPropertyImportRowSchema.safeParse({
      ...validRow,
      property: { ...validPropertyPlan, geocode: { status: 'pending', lat: null, lng: null } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown severity', () => {
    const result = resolvedPropertyImportRowSchema.safeParse({ ...validRow, severity: 'fatal' });
    expect(result.success).toBe(false);
  });
});

describe('propertyImportPreviewResponseSchema', () => {
  it('accepts a valid preview response', () => {
    const result = propertyImportPreviewResponseSchema.safeParse({
      importId: '123e4567-e89b-12d3-a456-426614174000',
      tenantId: '123e4567-e89b-12d3-a456-426614174001',
      summary: { totalRows: 1, importable: 1, withWarnings: 0, withErrors: 0 },
      rows: [validRow],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a summary with negative counts', () => {
    const result = propertyImportPreviewResponseSchema.safeParse({
      importId: '123e4567-e89b-12d3-a456-426614174000',
      tenantId: '123e4567-e89b-12d3-a456-426614174001',
      summary: { totalRows: -1, importable: 0, withWarnings: 0, withErrors: 0 },
      rows: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('commitPropertyImportSchema', () => {
  it('defaults skipInvalidRows to false', () => {
    expect(commitPropertyImportSchema.parse({})).toEqual({ skipInvalidRows: false });
  });

  it('accepts an explicit skipInvalidRows', () => {
    expect(commitPropertyImportSchema.parse({ skipInvalidRows: true })).toEqual({
      skipInvalidRows: true,
    });
  });
});
