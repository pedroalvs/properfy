import { describe, it, expect } from 'vitest';
import {
  createPropertySchema,
  updatePropertySchema,
  listPropertiesQuerySchema,
  propertyRulesSchema,
  propertySummaryQuerySchema,
  propertySummaryResponseSchema,
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
    type: 'HOUSE' as const,
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

  it('should strip a client-supplied propertyCode (code is server-generated)', () => {
    const result = createPropertySchema.safeParse({
      ...validInput,
      propertyCode: 'PROP-001',
    });
    expect(result.success).toBe(true);
    expect(result.success && 'propertyCode' in result.data).toBe(false);
  });

  it('should accept an optional apartmentNumber and trim it', () => {
    const result = createPropertySchema.safeParse({
      ...validInput,
      type: 'APARTMENT',
      apartmentNumber: '  Apt 12B  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apartmentNumber).toBe('Apt 12B');
    }
  });

  it('should reject apartmentNumber exceeding 50 characters', () => {
    const result = createPropertySchema.safeParse({
      ...validInput,
      apartmentNumber: 'a'.repeat(51),
    });
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

  it('should accept new optional detail fields', () => {
    const result = createPropertySchema.safeParse({
      ...validInput,
      privateAreaM2: 85.5,
      totalAreaM2: 120,
      furnished: true,
      linenProvided: false,
      rentAmount: 2500.0,
    });
    expect(result.success).toBe(true);
  });

  it('should accept APARTMENT type and reject removed/legacy types', () => {
    expect(createPropertySchema.safeParse({ ...validInput, type: 'APARTMENT' }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...validInput, type: 'RESIDENTIAL' }).success).toBe(
      false,
    );
    expect(createPropertySchema.safeParse({ ...validInput, type: 'COMMERCIAL' }).success).toBe(
      false,
    );
    expect(createPropertySchema.safeParse({ ...validInput, type: 'INDUSTRIAL' }).success).toBe(
      false,
    );
    expect(createPropertySchema.safeParse({ ...validInput, type: 'RURAL' }).success).toBe(false);
  });

  it('should reject non-positive areas and negative rent', () => {
    expect(createPropertySchema.safeParse({ ...validInput, privateAreaM2: 0 }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...validInput, totalAreaM2: -5 }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...validInput, rentAmount: -1 }).success).toBe(false);
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
      apartmentNumber: null,
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
      type: 'HOUSE',
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

describe('propertySummaryQuerySchema', () => {
  it('should accept an empty query', () => {
    const result = propertySummaryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept tenantId, branchId and search', () => {
    const result = propertySummaryQuerySchema.safeParse({
      tenantId: '11111111-1111-4111-8111-111111111111',
      branchId: '22222222-2222-4222-8222-222222222222',
      search: 'Main St',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a non-uuid tenantId', () => {
    expect(propertySummaryQuerySchema.safeParse({ tenantId: 'abc' }).success).toBe(false);
  });

  it('should reject a non-uuid branchId', () => {
    expect(propertySummaryQuerySchema.safeParse({ branchId: 'abc' }).success).toBe(false);
  });

  it('should reject search longer than 200 chars', () => {
    expect(propertySummaryQuerySchema.safeParse({ search: 'x'.repeat(201) }).success).toBe(false);
  });

  it('should not accept a type filter (stripped as unknown key)', () => {
    const result = propertySummaryQuerySchema.safeParse({ type: 'HOUSE' });
    expect(result.success).toBe(true);
    expect(result.success && 'type' in result.data).toBe(false);
  });
});

describe('propertySummaryResponseSchema', () => {
  it('should accept valid counts', () => {
    const result = propertySummaryResponseSchema.safeParse({
      totalCount: 10,
      houseCount: 4,
      apartmentCount: 6,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative counts', () => {
    expect(
      propertySummaryResponseSchema.safeParse({ totalCount: -1, houseCount: 0, apartmentCount: 0 })
        .success,
    ).toBe(false);
  });

  it('should reject non-integer counts', () => {
    expect(
      propertySummaryResponseSchema.safeParse({ totalCount: 1.5, houseCount: 0, apartmentCount: 0 })
        .success,
    ).toBe(false);
  });
});
