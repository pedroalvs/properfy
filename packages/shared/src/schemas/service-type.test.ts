import { describe, it, expect } from 'vitest';
import {
  createServiceTypeSchema,
  updateServiceTypeSchema,
  listServiceTypesQuerySchema,
} from './service-type';

describe('createServiceTypeSchema', () => {
  const validInput = {
    code: 'ROUTINE_INSP',
    name: 'Routine Inspection',
    flowType: 'ROUTINE' as const,
  };

  it('should accept valid input', () => {
    const result = createServiceTypeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should default requiresTenantConfirmation to true', () => {
    const result = createServiceTypeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiresTenantConfirmation).toBe(true);
    }
  });

  it('should reject missing code', () => {
    const { code, ...rest } = validInput;
    const result = createServiceTypeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const { name, ...rest } = validInput;
    const result = createServiceTypeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid flowType', () => {
    const result = createServiceTypeSchema.safeParse({
      ...validInput,
      flowType: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('should convert code to uppercase', () => {
    const result = createServiceTypeSchema.safeParse({
      ...validInput,
      code: 'routine_insp',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('ROUTINE_INSP');
    }
  });
});

describe('updateServiceTypeSchema', () => {
  it('should accept partial valid input', () => {
    const result = updateServiceTypeSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateServiceTypeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject invalid status', () => {
    const result = updateServiceTypeSchema.safeParse({ status: 'DELETED' });
    expect(result.success).toBe(false);
  });
});

describe('listServiceTypesQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listServiceTypesQuerySchema.safeParse({
      status: 'ACTIVE',
      search: 'routine',
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listServiceTypesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should reject invalid status', () => {
    const result = listServiceTypesQuerySchema.safeParse({ status: 'DELETED' });
    expect(result.success).toBe(false);
  });
});
