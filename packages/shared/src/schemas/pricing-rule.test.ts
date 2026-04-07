import { describe, it, expect } from 'vitest';
import {
  bonusRuleSchema,
  createPricingRuleSchema,
  updatePricingRuleSchema,
  listPricingRulesQuerySchema,
} from './pricing-rule';

describe('bonusRuleSchema', () => {
  it('should accept a valid FLAT_BONUS rule', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'FLAT_BONUS',
      bonusAmount: 25.00,
      description: 'Weekend flat bonus',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('FLAT_BONUS');
      expect(result.data.bonusAmount).toBe(25.00);
    }
  });

  it('should accept a valid VOLUME_TIER rule', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'VOLUME_TIER',
      volumeThreshold: 10,
      bonusPercentage: 15,
      maxBonusPerPeriod: 500,
    });
    expect(result.success).toBe(true);
  });

  it('should accept a valid DAY_OF_WEEK rule', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'DAY_OF_WEEK',
      dayOfWeek: 6,
      bonusAmount: 30,
    });
    expect(result.success).toBe(true);
  });

  it('should accept a valid SERVICE_TYPE_BONUS rule', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'SERVICE_TYPE_BONUS',
      bonusPercentage: 10,
      description: 'Outgoing inspection bonus',
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid type', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'UNKNOWN_TYPE',
      bonusAmount: 10,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing type', () => {
    const result = bonusRuleSchema.safeParse({
      bonusAmount: 10,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative bonusAmount', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'FLAT_BONUS',
      bonusAmount: -5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject bonusPercentage above 100', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'VOLUME_TIER',
      bonusPercentage: 150,
    });
    expect(result.success).toBe(false);
  });

  it('should reject dayOfWeek out of range', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'DAY_OF_WEEK',
      dayOfWeek: 7,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer volumeThreshold', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'VOLUME_TIER',
      volumeThreshold: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject volumeThreshold less than 1', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'VOLUME_TIER',
      volumeThreshold: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject description longer than 500 characters', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'FLAT_BONUS',
      description: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should allow all optional fields to be omitted', () => {
    const result = bonusRuleSchema.safeParse({ type: 'FLAT_BONUS' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.volumeThreshold).toBeUndefined();
      expect(result.data.bonusAmount).toBeUndefined();
      expect(result.data.bonusPercentage).toBeUndefined();
      expect(result.data.dayOfWeek).toBeUndefined();
      expect(result.data.maxBonusPerPeriod).toBeUndefined();
      expect(result.data.description).toBeUndefined();
    }
  });

  it('should preserve unknown keys via passthrough', () => {
    const result = bonusRuleSchema.safeParse({
      type: 'FLAT_BONUS',
      bonusAmount: 10,
      customField: 'preserved',
      anotherField: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('customField', 'preserved');
      expect(result.data).toHaveProperty('anotherField', 42);
    }
  });
});

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
    const { serviceTypeId: _serviceTypeId, ...rest } = validInput;
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

  it('should accept a valid bonusRuleJson', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      bonusRuleJson: { type: 'FLAT_BONUS', bonusAmount: 20 },
    });
    expect(result.success).toBe(true);
  });

  it('should reject bonusRuleJson with invalid type', () => {
    const result = createPricingRuleSchema.safeParse({
      ...validInput,
      bonusRuleJson: { type: 'BAD_TYPE', bonusAmount: 20 },
    });
    expect(result.success).toBe(false);
  });

  it('should accept omitted bonusRuleJson', () => {
    const result = createPricingRuleSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bonusRuleJson).toBeUndefined();
    }
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

  it('should accept valid bonusRuleJson in update', () => {
    const result = updatePricingRuleSchema.safeParse({
      bonusRuleJson: { type: 'DAY_OF_WEEK', dayOfWeek: 0, bonusAmount: 15 },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid bonusRuleJson type in update', () => {
    const result = updatePricingRuleSchema.safeParse({
      bonusRuleJson: { type: 'INVALID' },
    });
    expect(result.success).toBe(false);
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
