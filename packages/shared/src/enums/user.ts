export const UserRole = {
  AM: 'AM',
  OP: 'OP',
  CL_ADMIN: 'CL_ADMIN',
  CL_USER: 'CL_USER',
  INSP: 'INSP',
  TNT: 'TNT',
  SYS: 'SYS',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  LOCKED: 'LOCKED',
  PENDING_INVITE: 'PENDING_INVITE',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const CL_USER_PERMISSIONS = [
  'create_appointments',
  'cancel_appointments',
  'reject_appointments',
  'reschedule_appointments',
  'force_confirmation',
  'create_properties',
] as const;
export type ClUserPermission = (typeof CL_USER_PERMISSIONS)[number];
