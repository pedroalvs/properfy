export const ServiceGroupStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ASSIGNED: 'ASSIGNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ServiceGroupStatus = (typeof ServiceGroupStatus)[keyof typeof ServiceGroupStatus];

export const PriorityMode = {
  STANDARD: 'STANDARD',
  URGENT: 'URGENT',
} as const;
export type PriorityMode = (typeof PriorityMode)[keyof typeof PriorityMode];
