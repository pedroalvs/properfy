import { z } from 'zod';
import { paginationSchema } from './pagination';

export const BonusRuleType = {
  VOLUME_TIER: 'VOLUME_TIER',
  SERVICE_TYPE_BONUS: 'SERVICE_TYPE_BONUS',
  DAY_OF_WEEK: 'DAY_OF_WEEK',
  FLAT_BONUS: 'FLAT_BONUS',
} as const;
export type BonusRuleType = (typeof BonusRuleType)[keyof typeof BonusRuleType];

export const bonusRuleSchema = z
  .object({
    type: z.enum(['VOLUME_TIER', 'SERVICE_TYPE_BONUS', 'DAY_OF_WEEK', 'FLAT_BONUS']),
    volumeThreshold: z.number().int().min(1).optional(),
    bonusAmount: z.number().min(0).optional(),
    bonusPercentage: z.number().min(0).max(100).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    maxBonusPerPeriod: z.number().min(0).optional(),
    description: z.string().max(500).optional(),
  })
  .passthrough();
export type BonusRule = z.infer<typeof bonusRuleSchema>;

export const createPricingRuleSchema = z.object({
  tenantId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  priceAmount: z.number().positive().multipleOf(0.01),
  payoutType: z.enum(['FIXED', 'PERCENTAGE']),
  payoutValue: z.number().positive().multipleOf(0.01),
  bonusRuleJson: bonusRuleSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = z.object({
  priceAmount: z.number().positive().multipleOf(0.01).optional(),
  payoutType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  payoutValue: z.number().positive().multipleOf(0.01).optional(),
  bonusRuleJson: bonusRuleSchema.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

export const listPricingRulesQuerySchema = paginationSchema.extend({
  tenantId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type ListPricingRulesQueryInput = z.infer<typeof listPricingRulesQuerySchema>;
