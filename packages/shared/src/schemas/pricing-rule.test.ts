import { describe, it, expect } from 'vitest';
import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  listPricingRulesQuerySchema,
} from './pricing-rule';

describe('createPricingRuleSchema', () => {
  const validInput = {
    serviceTypeId: '550e8400-e29b-41d4-a716-446655440000',
    priceAmount: 150.00,
    payoutType: 'FIXED' as const,
    payoutValue: 100.00,
  };

  it('should accept valid input', () => {
    const result = createPricingRuleSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should default status to ACTIVE', () => {
    const result = createPricingRuleSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('ACTIVE');
    }
  });

  it('should reject missing serviceTypeId', () => {
    const { serviceTypeId, ...rest } = validInput;
    const result = createPricingRuleSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid payoutType', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      payoutType: 'HOURLY',
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative priceAmount', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      priceAmount: -10,
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid decimal amounts', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      priceAmount: 99.99,
      payoutValue: 75.50,
    });
    expect(result.success).toBe(true);
  });
});

describe('updatePricingRuleSchema', () => {
  it('should accept partial valid input', () => {
    const result = updatePricingRuleSchema.safeParse({ priceAmount: 200.00 });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updatePricingRuleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept nullable bonusRuleJson', () => {
    const result = updatePricingRuleSchema.safeParse({ bonusRuleJson: null });
    expect(result.success).toBe(true);
  });
});

describe('listPricingRulesQuerySchema', () => {
  it('should accept valid filters', () => {
    const result = listPricingRulesQuerySchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      serviceTypeId: '550e8400-e29b-41d4-a716-446655440001',
      status: 'ACTIVE',
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should apply pagination defaults', () => {
    const result = listPricingRulesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortOrder).toBe('desc');
    }
  });
});
