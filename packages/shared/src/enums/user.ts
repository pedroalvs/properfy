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
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
