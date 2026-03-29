export const RegionStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type RegionStatus = (typeof RegionStatus)[keyof typeof RegionStatus];

export const SuburbStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type SuburbStatus = (typeof SuburbStatus)[keyof typeof SuburbStatus];
