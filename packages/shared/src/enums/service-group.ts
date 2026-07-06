export const ServiceGroupStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;
export type ServiceGroupStatus = (typeof ServiceGroupStatus)[keyof typeof ServiceGroupStatus];
