import { z } from 'zod';
import { paginationSchema } from './pagination';

export const createPricingRuleSchema = z.object({
  tenantId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  priceAmount: z.number().positive().multipleOf(0.01),
  payoutType: z.enum(['FIXED', 'PERCENTAGE']),
  payoutValue: z.number().positive().multipleOf(0.01),
  bonusRuleJson: z.record(z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = z.object({
  priceAmount: z.number().positive().multipleOf(0.01).optional(),
  payoutType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  payoutValue: z.number().positive().multipleOf(0.01).optional(),
  bonusRuleJson: z.record(z.unknown()).nullable().optional(),
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
