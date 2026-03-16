export const TenantStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const BranchStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type BranchStatus = (typeof BranchStatus)[keyof typeof BranchStatus];
