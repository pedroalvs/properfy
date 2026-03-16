export const ServiceTypeFlowType = {
  ROUTINE: 'ROUTINE',
  INGOING: 'INGOING',
  OUTGOING: 'OUTGOING',
} as const;
export type ServiceTypeFlowType = (typeof ServiceTypeFlowType)[keyof typeof ServiceTypeFlowType];

export const ServiceTypeStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type ServiceTypeStatus = (typeof ServiceTypeStatus)[keyof typeof ServiceTypeStatus];

export const PayoutType = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
} as const;
export type PayoutType = (typeof PayoutType)[keyof typeof PayoutType];

export const PriceRuleStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type PriceRuleStatus = (typeof PriceRuleStatus)[keyof typeof PriceRuleStatus];
