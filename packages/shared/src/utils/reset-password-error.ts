import { ApiError } from './api-error';

/** Backend error code returned when a password-reset token is invalid, expired, or already used. */
export const AUTH_INVALID_RESET_TOKEN = 'AUTH_INVALID_RESET_TOKEN';

export interface ResetPasswordErrorMessage {
  message: string;
  invalidToken: boolean;
}

/**
 * Maps a reset-password failure to the user-facing copy shared by the web hook
 * and the PWA page, keeping the invalid-token contract and messaging in one place.
 */
export function mapResetPasswordError(error: unknown): ResetPasswordErrorMessage {
  if (error instanceof ApiError) {
    if (error.code === AUTH_INVALID_RESET_TOKEN) {
      return {
        message: 'This reset link is invalid or has expired. Please request a new link.',
        invalidToken: true,
      };
    }
    if (error.status === 429) {
      return { message: 'Too many attempts. Please wait and try again.', invalidToken: false };
    }
    if (error.status >= 500) {
      return { message: 'Server error. Please try again later.', invalidToken: false };
    }
    return { message: error.message, invalidToken: false };
  }
  return { message: 'Something went wrong. Please try again.', invalidToken: false };
}
