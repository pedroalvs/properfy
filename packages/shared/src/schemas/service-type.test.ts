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
    requiresRentalTenantConfirmation: true,
    defaultDurationMinutes: 45,
  };

  it('should accept valid input with requiresRentalTenantConfirmation=true', () => {
    const result = createServiceTypeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept requiresRentalTenantConfirmation=false', () => {
    const result = createServiceTypeSchema.safeParse({ ...validInput, requiresRentalTenantConfirmation: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.requiresRentalTenantConfirmation).toBe(false);
  });

  it('should reject missing requiresRentalTenantConfirmation', () => {
    const { requiresRentalTenantConfirmation: _, ...rest } = validInput;
    const result = createServiceTypeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing code', () => {
    const { code: _code, ...rest } = validInput;
    const result = createServiceTypeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const { name: _name, ...rest } = validInput;
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

describe('defaultDurationMinutes (F04 TASK-F04-5 — required on create)', () => {
  const base = {
    code: 'ST1',
    name: 'Routine',
    flowType: 'ROUTINE' as const,
    requiresRentalTenantConfirmation: true,
  };

  it('createServiceTypeSchema accepts 5, 45, 480', () => {
    for (const v of [5, 45, 480]) {
      const r = createServiceTypeSchema.safeParse({ ...base, defaultDurationMinutes: v });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.defaultDurationMinutes).toBe(v);
    }
  });

  it('createServiceTypeSchema rejects 4, 481, 45.5, "45", null', () => {
    for (const v of [4, 481, 45.5, '45', null]) {
      const r = createServiceTypeSchema.safeParse({ ...base, defaultDurationMinutes: v });
      expect(r.success).toBe(false);
    }
  });

  it('createServiceTypeSchema rejects a missing value (required, no transitional default — TASK-F04-5)', () => {
    const r = createServiceTypeSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'defaultDurationMinutes')).toBe(true);
    }
  });

  it('updateServiceTypeSchema treats it as optional with the same bounds', () => {
    expect(updateServiceTypeSchema.safeParse({}).success).toBe(true);
    expect(updateServiceTypeSchema.safeParse({ defaultDurationMinutes: 60 }).success).toBe(true);
    expect(updateServiceTypeSchema.safeParse({ defaultDurationMinutes: 4 }).success).toBe(false);
    expect(updateServiceTypeSchema.safeParse({ defaultDurationMinutes: 481 }).success).toBe(false);
  });
});
