import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { useAuth } from './useAuth';

/**
 * The inspector's effective IANA timezone: personal timezone when set,
 * otherwise the platform default. Comes from `/v1/me` (`timezone` is already
 * `personal ?? platform` server-side); falls back to the platform default
 * while the full user is still hydrating.
 */
export function useEffectiveTimezone(): string {
  const { user } = useAuth();
  return user?.timezone ?? PLATFORM_TIMEZONE;
}
