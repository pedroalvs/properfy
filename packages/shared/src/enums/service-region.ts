export const RegionStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type RegionStatus = (typeof RegionStatus)[keyof typeof RegionStatus];
