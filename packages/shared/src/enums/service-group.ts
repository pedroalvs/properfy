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

/**
 * Exception types that allow a service group to be created below the standard
 * minimum of 5 appointments. Each type has its own size limits.
 *
 * See: projeto-consolidado/service-group-exceptions.md for full rationale,
 * Scenario 1 vs Scenario 2 analysis, and migration path.
 */
export const ServiceGroupExceptionType = {
  /** Area with insufficient appointment density to fill a standard group. min=1, max=25 */
  LOW_DENSITY_REGION: 'LOW_DENSITY_REGION',
  /** Appointment(s) geographically or temporally isolated from any compatible cluster. min=1, max=3 */
  ISOLATED_SERVICE: 'ISOLATED_SERVICE',
  /** Agency requiring expedited service regardless of group size. min=1, max=8 */
  PRIORITY_CLIENT: 'PRIORITY_CLIENT',
} as const;
export type ServiceGroupExceptionType =
  (typeof ServiceGroupExceptionType)[keyof typeof ServiceGroupExceptionType];
