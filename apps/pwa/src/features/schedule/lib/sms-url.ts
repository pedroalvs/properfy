import { isApplePlatform, type NavigationEnv } from '@/features/day-plan/lib/navigation-url';

/**
 * Builds an `sms:` deep link that opens the native messaging app with the
 * recipient and the message body pre-filled. Pure: platform detection reads the
 * injected `env`, never a global, so it is fully testable.
 *
 * The body separator differs by platform — iOS/iPadOS expects
 * `sms:<number>&body=…` while Android (and desktop) expect `sms:<number>?body=…`.
 * We reuse the day-plan `isApplePlatform` detection so both deep-link builders
 * agree on what "Apple" means.
 */

function resolveEnv(env?: Partial<NavigationEnv>): NavigationEnv {
  return {
    userAgent: env?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    maxTouchPoints:
      env?.maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0),
  };
}

/** Keep only a leading `+` and digits; `sms:` hrefs break on spaces/parens. */
function sanitizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export function buildSmsUrl(phone: string, body: string, env?: Partial<NavigationEnv>): string {
  const number = sanitizePhone(phone);
  const encodedBody = encodeURIComponent(body);
  const separator = isApplePlatform(resolveEnv(env)) ? '&' : '?';
  return `sms:${number}${separator}body=${encodedBody}`;
}
