export const ServiceGroupStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ACCEPTED: 'ACCEPTED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;
export type ServiceGroupStatus = (typeof ServiceGroupStatus)[keyof typeof ServiceGroupStatus];

export const PriorityMode = {
  STANDARD: 'STANDARD',
  PRIORITY_24H: 'PRIORITY_24H',
} as const;
export type PriorityMode = (typeof PriorityMode)[keyof typeof PriorityMode];
