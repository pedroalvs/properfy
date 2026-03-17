import { describe, it, expect } from 'vitest';
import {
  createPropertySchema,
  updatePropertySchema,
  listPropertiesQuerySchema,
} from './property';

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
      rulesJson: { maxOccupants: 4 },
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
});
