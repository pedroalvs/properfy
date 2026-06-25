import type { UserRole } from '@properfy/shared';

export interface LoginInput {
  email: string;
  password: string;
  totpCode?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
  totpSetupRequired?: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    tenantId: string | null;
    branchId: string | null;
    totpEnabled: boolean;
  };
}
