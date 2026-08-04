import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { useAuth } from './useAuth';

/**
 * The signed-in user's effective IANA timezone: their personal timezone when
 * set (AM/OP/INSP), otherwise their agency's, otherwise the platform default.
 * The resolution happens server-side — `/v1/me` returns the already-effective
 * value — so this hook only falls back for the brief window before the full
 * profile hydrates.
 */
export function useEffectiveTimezone(): string {
  const { user } = useAuth();
  return user?.timezone ?? PLATFORM_TIMEZONE;
}
