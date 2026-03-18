export interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type ChangePasswordFormErrors = Partial<Record<keyof ChangePasswordFormData, string>>;

export const EMPTY_CHANGE_PASSWORD_FORM: ChangePasswordFormData = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export interface TotpSetupData {
  totpUri: string;
  secret: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}
