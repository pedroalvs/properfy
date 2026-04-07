import { describe, it, expect } from 'vitest';
import {
  createPropertySchema,
  updatePropertySchema,
  listPropertiesQuerySchema,
  propertyRulesSchema,
} from './property';
import type { PropertyRules } from './property';
import {
  propertyAddressSchema,
  propertyAddressUpdateSchema,
} from './address';

describe('propertyRulesSchema', () => {
  it('should accept a full rules object', () => {
    const result = propertyRulesSchema.safeParse({
      keyRequired: true,
      meetingLocation: 'Front gate on Smith Street',
      keyLocation: 'Lockbox beside front door, code 1234',
      accessInstructions: 'Buzz unit 5, then take lift to level 3',
      parkingInfo: 'Visitor parking available in basement P1',
      petInfo: 'Large dog in backyard, do not open back gate',
      specialNotes: 'Tenant works night shifts, prefer afternoon inspections',
    });
    expect(result.success).toBe(true);
  });

  it('should accept a partial rules object', () => {
    const result = propertyRulesSchema.safeParse({
      keyRequired: false,
      parkingInfo: 'Street parking only',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyRequired).toBe(false);
      expect(result.data.parkingInfo).toBe('Street parking only');
      expect(result.data.meetingLocation).toBeUndefined();
    }
  });

  it('should accept an empty object', () => {
    const result = propertyRulesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should passthrough unknown fields for forward-compatibility', () => {
    const result = propertyRulesSchema.safeParse({
      keyRequired: true,
      futureField: 'some value',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyRequired).toBe(true);
      expect((result.data as Record<string, unknown>).futureField).toBe('some value');
    }
  });

  it('should reject keyRequired with non-boolean value', () => {
    const result = propertyRulesSchema.safeParse({
      keyRequired: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject meetingLocation exceeding 500 characters', () => {
    const result = propertyRulesSchema.safeParse({
      meetingLocation: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should reject keyLocation exceeding 500 characters', () => {
    const result = propertyRulesSchema.safeParse({
      keyLocation: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should reject accessInstructions exceeding 1000 characters', () => {
    const result = propertyRulesSchema.safeParse({
      accessInstructions: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('should reject parkingInfo exceeding 500 characters', () => {
    const result = propertyRulesSchema.safeParse({
      parkingInfo: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should reject petInfo exceeding 500 characters', () => {
    const result = propertyRulesSchema.safeParse({
      petInfo: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should reject specialNotes exceeding 1000 characters', () => {
    const result = propertyRulesSchema.safeParse({
      specialNotes: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('should export PropertyRules type', () => {
    const rules: PropertyRules = { keyRequired: true };
    expect(rules.keyRequired).toBe(true);
  });
});

describe('propertyAddressSchema', () => {
  it('should accept valid full address', () => {
    const result = propertyAddressSchema.safeParse({
      street: '123 Main St',
      addressLine2: 'Unit 5',
      suburb: 'Bondi',
      postcode: '2026',
      state: 'NSW',
      country: 'NZ',
    });
    expect(result.success).toBe(true);
  });

  it('should accept minimal address with country default', () => {
    const result = propertyAddressSchema.safeParse({
      street: '123 Main St',
      suburb: 'Bondi',
      postcode: '2026',
      state: 'NSW',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('AU');
    }
  });

  it('should reject empty street', () => {
    const result = propertyAddressSchema.safeParse({
      street: '',
      suburb: 'Bondi',
      postcode: '2026',
      state: 'NSW',
    });
    expect(result.success).toBe(false);
  });

  it('should reject street exceeding 300 characters', () => {
    const result = propertyAddressSchema.safeParse({
      street: 'a'.repeat(301),
      suburb: 'Bondi',
      postcode: '2026',
      state: 'NSW',
    });
    expect(result.success).toBe(false);
  });

  it('should reject country with less than 2 characters', () => {
    const result = propertyAddressSchema.safeParse({
      street: '123 Main St',
      suburb: 'Bondi',
      postcode: '2026',
      state: 'NSW',
      country: 'A',
    });
    expect(result.success).toBe(false);
  });

  it('should trim whitespace from fields', () => {
    const result = propertyAddressSchema.safeParse({
      street: '  123 Main St  ',
      suburb: '  Bondi  ',
      postcode: '  2026  ',
      state: '  NSW  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.street).toBe('123 Main St');
      expect(result.data.suburb).toBe('Bondi');
      expect(result.data.postcode).toBe('2026');
      expect(result.data.state).toBe('NSW');
    }
  });
});

describe('propertyAddressUpdateSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    const result = propertyAddressUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial address fields', () => {
    const result = propertyAddressUpdateSchema.safeParse({
      street: '456 Oak Ave',
      suburb: 'Manly',
    });
    expect(result.success).toBe(true);
  });

  it('should accept nullable addressLine2', () => {
    const result = propertyAddressUpdateSchema.safeParse({
      addressLine2: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty street when provided', () => {
    const result = propertyAddressUpdateSchema.safeParse({ street: '' });
    expect(result.success).toBe(false);
  });
});

describe('createPropertySchema', () => {
  const validInput = {
    propertyCode: 'PROP-001',
    type: 'RESIDENTIAL' as const,
    street: '123 Main St',
    suburb: 'Bondi',
    postcode: '2026',
    state: 'NSW',
  };

  it('should accept valid full input', () => {
    const result = createPropertySchema.safeParse({
      ...validInput,
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      addressLine2: 'Unit 5',
      country: 'NZ',
      notes: 'Corner property',
      rulesJson: { keyRequired: true, meetingLocation: 'Front gate' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid minimal input with defaults', () => {
    const result = createPropertySchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('AU');
    }
  });

  it('should reject missing propertyCode', () => {
    const { propertyCode: _propertyCode, ...rest } = validInput;
    const result = createPropertySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing street', () => {
    const { street: _street, ...rest } = validInput;
    const result = createPropertySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing suburb', () => {
    const { suburb: _suburb, ...rest } = validInput;
    const result = createPropertySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing postcode', () => {
    const { postcode: _postcode, ...rest } = validInput;
    const result = createPropertySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing state', () => {
    const { state: _state, ...rest } = validInput;
    const result = createPropertySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject propertyCode exceeding 50 characters', () => {
    const result = createPropertySchema.safeParse({
      ...validInput,
      propertyCode: 'a'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('should default country to AU', () => {
    const result = createPropertySchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('AU');
    }
  });
});

describe('updatePropertySchema', () => {
  it('should accept partial valid input', () => {
    const result = updatePropertySchema.safeParse({ street: '456 Oak Ave' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updatePropertySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept nullable fields', () => {
    const result = updatePropertySchema.safeParse({
      addressLine2: null,
      notes: null,
      rulesJson: null,
      branchId: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid latitude and longitude', () => {
    const result = updatePropertySchema.safeParse({
      latitude: -33.8688,
      longitude: 151.2093,
    });
    expect(result.success).toBe(true);
  });

  it('should accept null latitude and longitude', () => {
    const result = updatePropertySchema.safeParse({
      latitude: null,
      longitude: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject latitude out of range', () => {
    const result = updatePropertySchema.safeParse({ latitude: -91 });
    expect(result.success).toBe(false);
  });

  it('should reject longitude out of range', () => {
    const result = updatePropertySchema.safeParse({ longitude: 181 });
    expect(result.success).toBe(false);
  });
});

describe('listPropertiesQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listPropertiesQuerySchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'COMMERCIAL',
      search: 'bondi',
      page: 2,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listPropertiesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should reject invalid type', () => {
    const result = listPropertiesQuerySchema.safeParse({ type: 'OFFICE' });
    expect(result.success).toBe(false);
  });

  it('should accept valid radius filter params', () => {
    const result = listPropertiesQuerySchema.safeParse({
      nearLat: '-33.8688',
      nearLng: '151.2093',
      nearRadiusKm: '10',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nearLat).toBe(-33.8688);
      expect(result.data.nearLng).toBe(151.2093);
      expect(result.data.nearRadiusKm).toBe(10);
    }
  });

  it('should reject partial radius filter params (missing radiusKm)', () => {
    const result = listPropertiesQuerySchema.safeParse({
      nearLat: '-33.8688',
      nearLng: '151.2093',
    });
    expect(result.success).toBe(false);
  });

  it('should reject partial radius filter params (missing lat/lng)', () => {
    const result = listPropertiesQuerySchema.safeParse({
      nearRadiusKm: '10',
    });
    expect(result.success).toBe(false);
  });

  it('should accept query with no radius filter params', () => {
    const result = listPropertiesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject radius exceeding 500km', () => {
    const result = listPropertiesQuerySchema.safeParse({
      nearLat: '-33.8688',
      nearLng: '151.2093',
      nearRadiusKm: '600',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid latitude for radius filter', () => {
    const result = listPropertiesQuerySchema.safeParse({
      nearLat: '100',
      nearLng: '151.2093',
      nearRadiusKm: '10',
    });
    expect(result.success).toBe(false);
  });
});
