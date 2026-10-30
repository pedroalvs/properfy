/**
 * Inspector notice constants shared by backend (validation + delivery) and the PWA
 * service worker (deep-link resolution). Platform-scoped feature (no tenant_id) — see
 * the multi-tenant exception in the F02-1 spec and CLAUDE.md §7 rule 1.
 */

/** System-generated notice types. F04 raises ROUTE_*; F03 raises COMPLETION_REMINDER; F08 raises PERFORMANCE_MESSAGE. */
export const SYSTEM_INSPECTOR_NOTICE_TYPES = [
  'ROUTE_PUBLISHED', // F04 – critical (D1)
  'ROUTE_CHANGED', // F04 – critical (D1)
  'COMPLETION_REMINDER', // F03 – critical (D1)
  'PERFORMANCE_MESSAGE', // F08 – never critical (D1)
] as const;

export type SystemInspectorNoticeType = (typeof SYSTEM_INSPECTOR_NOTICE_TYPES)[number];

/** Which system notice types are critical (drive the SMS fallback). Manual notices set `critical` explicitly. */
export const SYSTEM_NOTICE_CRITICALITY: Record<SystemInspectorNoticeType, boolean> = {
  ROUTE_PUBLISHED: true,
  ROUTE_CHANGED: true,
  COMPLETION_REMINDER: true,
  PERFORMANCE_MESSAGE: false,
};

export function isCriticalSystemNoticeType(type: SystemInspectorNoticeType): boolean {
  return SYSTEM_NOTICE_CRITICALITY[type];
}

/** Max characters for the fallback SMS body (before pipeline GSM/UCS2 segmentation). */
export const INSPECTOR_NOTICE_SMS_MAX_CHARS = 300;
/** Max characters of the notice body carried in the push payload. */
export const INSPECTOR_NOTICE_PUSH_BODY_MAX_CHARS = 180;

const SMS_TRUNCATION_SUFFIX = '… Open the Properfy app.';

/**
 * Builds the SMS body for a critical inspector notice:
 * `Properfy: <title>[.] <body>` with newlines/whitespace collapsed; truncated to
 * {@link INSPECTOR_NOTICE_SMS_MAX_CHARS} ending with the app hint when too long.
 */
export function buildInspectorNoticeSmsMessage(title: string, body: string): string {
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const normalizedTitle = normalize(title);
  const normalizedBody = normalize(body);
  const needsSentenceStop = !/[.!?]$/.test(normalizedTitle);
  const head = `Properfy: ${normalizedTitle}${needsSentenceStop ? '.' : ''}`;
  const full = `${head} ${normalizedBody}`;
  if (full.length <= INSPECTOR_NOTICE_SMS_MAX_CHARS) {
    return full;
  }
  const budget = INSPECTOR_NOTICE_SMS_MAX_CHARS - SMS_TRUNCATION_SUFFIX.length;
  const truncated = full.slice(0, budget).trimEnd();
  return `${truncated}${SMS_TRUNCATION_SUFFIX}`;
}

/** Default in-app deep link for a notice (the inspector's announcement detail). */
export function inspectorNoticeDeepLink(noticeId: string): string {
  return `/profile/announcements/${noticeId}`;
}

/**
 * Allowlist of tap targets a system notice may deep-link to. `:id` is a lowercase UUID.
 * The backend validates `targetPath` against this list and the PWA service worker's
 * `resolveClickTarget` uses the same list. F04 appends `/today`.
 */
export const INSPECTOR_NOTICE_TARGET_PATTERNS = [
  '/profile/announcements/:id', // default (id = noticeId)
  '/schedule/:id', // service detail on the schedule (id = appointmentId)
] as const;

/** Lowercase UUID v1–5 matcher used for the `:id` segment of an allowlisted target path. */
export const INSPECTOR_NOTICE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * L-F02-08: exact segment-by-segment match against {@link INSPECTOR_NOTICE_TARGET_PATTERNS}.
 * String 1–200 chars, starts with `/`, no `?`/`#`/`//`/`%`/`\`, no trailing `/`; literal
 * segments match case-sensitively; `:id` matches a lowercase UUID. Non-string ⇒ false (no throw).
 */
export function isAllowedInspectorNoticeTargetPath(path: unknown): boolean {
  if (typeof path !== 'string') return false;
  if (path.length < 1 || path.length > 200) return false;
  if (!path.startsWith('/')) return false;
  if (/[?#%\\]/.test(path)) return false;
  if (path.includes('//')) return false;
  if (path.endsWith('/')) return false;

  const segments = path.split('/');
  return INSPECTOR_NOTICE_TARGET_PATTERNS.some((pattern) => {
    const patternSegments = pattern.split('/');
    if (patternSegments.length !== segments.length) return false;
    return patternSegments.every((patternSegment, index) => {
      const segment = segments[index] ?? '';
      if (patternSegment === ':id') {
        return INSPECTOR_NOTICE_UUID_RE.test(segment);
      }
      return patternSegment === segment;
    });
  });
}

/** Returns `targetPath` when allowlisted, otherwise the default announcement deep link. */
export function resolveInspectorNoticeTargetPath(
  noticeId: string,
  targetPath?: string | null,
): string {
  if (targetPath && isAllowedInspectorNoticeTargetPath(targetPath)) {
    return targetPath;
  }
  return inspectorNoticeDeepLink(noticeId);
}

/**
 * L-F02-03: delivery-job `expireInMinutes` sized by recipient count
 * (2 subscriptions × 10 s timeout ÷ 10 parallel + 5 min slack), floored at 15.
 * 500 recipients ⇒ 22.
 */
export function getInspectorNoticeDeliverExpireMinutes(recipientCount: number): number {
  return Math.max(15, Math.ceil((recipientCount * 2 * 10) / 10 / 60) + 5);
}
