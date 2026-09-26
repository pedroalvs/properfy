import { UserRole } from '@properfy/shared';
import type { AuthUser } from '@/hooks/useAuth';

/**
 * Optional 2FA suggestion for non-mandatory users.
 *
 * 2FA is only *mandatory* for Admin Master (`AM`) — the backend drives that flow
 * with a setup-stage session. Everyone else logs in to a full session, so the
 * suggestion is a post-login nudge, dismissible with a 30-day snooze.
 *
 * The snooze has no backend flag, so it lives per-user in `localStorage`. It is a
 * best-effort convenience: a cleared browser (or a second device) simply asks
 * again, which is acceptable for a suggestion.
 */

const SNOOZE_KEY_PREFIX = 'properfy:web:totp-suggest-snooze:';
const SNOOZE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Roles that see the suggestion on the web portals. Inspectors (`INSP`) use the
 * PWA and tenants (`TNT`) only reach the public portal link, so neither is nudged
 * here.
 */
const WEB_SUGGEST_ROLES = new Set<string>([
  UserRole.OP,
  UserRole.CL_ADMIN,
  UserRole.CL_USER,
]);

function snoozeKey(userId: string): string {
  return `${SNOOZE_KEY_PREFIX}${userId}`;
}

/** Remember the dismissal for 30 days. Storage failures are swallowed. */
export function snoozeTotpSuggestion(userId: string): void {
  try {
    localStorage.setItem(snoozeKey(userId), String(Date.now() + SNOOZE_DURATION_MS));
  } catch {
    // Private mode / blocked storage — the suggestion simply shows again.
  }
}

/** True when a stored snooze is still in the future. Failures read as "not snoozed". */
export function isTotpSuggestionSnoozed(userId: string): boolean {
  try {
    const raw = localStorage.getItem(snoozeKey(userId));
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

/**
 * Whether to offer the optional 2FA setup to this user after login: a web-portal
 * non-AM role that has not enrolled and has not snoozed the prompt.
 */
export function shouldSuggestTotp(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.role === UserRole.AM) return false;
  if (!WEB_SUGGEST_ROLES.has(user.role)) return false;
  if (user.totpEnabled === true) return false;
  return !isTotpSuggestionSnoozed(user.id);
}
