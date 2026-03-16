import { describe, it, expect } from 'vitest';
import { restrictionSchema } from './restriction';
import { RestrictionSource } from '../enums/appointment';

describe('restrictionSchema', () => {
  it('should be valid with isHome and source only', () => {
    const result = restrictionSchema.safeParse({
      isHome: true,
      source: RestrictionSource.TENANT_PORTAL,
    });
    expect(result.success).toBe(true);
  });

  it('should be valid with all fields', () => {
    const result = restrictionSchema.safeParse({
      isHome: false,
      unavailableDays: ['2026-04-05', '2026-04-12'],
      unavailableHours: ['09:00-12:00', '14:00-17:00'],
      notes: 'Tenant works from home on Tuesdays',
      source: RestrictionSource.OPERATOR,
    });
    expect(result.success).toBe(true);
  });

  it('should be invalid with an unknown source value', () => {
    const result = restrictionSchema.safeParse({
      isHome: true,
      source: 'UNKNOWN_SOURCE',
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid with wrong time format in unavailableHours', () => {
    const result = restrictionSchema.safeParse({
      isHome: true,
      source: RestrictionSource.TENANT_PORTAL,
      unavailableHours: ['9am-10am'],
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid with wrong date format in unavailableDays', () => {
    const result = restrictionSchema.safeParse({
      isHome: true,
      source: RestrictionSource.IMPORT,
      unavailableDays: ['05/04/2026'],
    });
    expect(result.success).toBe(false);
  });

  it('should be invalid when source is missing', () => {
    const result = restrictionSchema.safeParse({
      isHome: true,
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid RestrictionSource values', () => {
    for (const source of Object.values(RestrictionSource)) {
      const result = restrictionSchema.safeParse({ isHome: false, source });
      expect(result.success).toBe(true);
    }
  });
});
