/// <reference lib="webworker" />
import {
  inspectorNoticeDeepLink,
  isAllowedInspectorNoticeTargetPath,
} from '@properfy/shared';

/**
 * Pure helpers used by `sw.ts`. Kept free of top-level service-worker side
 * effects so they can be unit-tested in jsdom. All target-path validation goes
 * through the shared `isAllowedInspectorNoticeTargetPath` (D15/D24): the same
 * allowlist the backend validates, with no local normalization.
 */

const INBOX_URL = '/profile/announcements';
const ICON = '/icons/icon-192.png';

export interface BuiltNotification {
  title: string;
  options: {
    body: string;
    tag: string;
    data: { url: string };
    requireInteraction?: boolean;
    icon?: string;
    badge?: string;
  };
}

interface PushPayload {
  v: number;
  noticeId: string;
  title: string;
  body: string;
  critical: boolean;
  url?: string;
}

function parsePayload(text: string | null): PushPayload | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.noticeId !== 'string' || p.noticeId.length === 0) return null;
  if (typeof p.title !== 'string' || p.title.trim().length === 0) return null;
  if (typeof p.body !== 'string') return null;
  return {
    v: typeof p.v === 'number' ? p.v : 1,
    noticeId: p.noticeId,
    title: p.title,
    body: p.body,
    critical: p.critical === true,
    url: typeof p.url === 'string' ? p.url : undefined,
  };
}

/**
 * Resolve the notification `data.url`. The backend already resolves the payload
 * `url`, but the SW re-validates it against the shared allowlist. When the
 * target is an allowlisted page that is NOT the notice's own announcement page,
 * append `?fromNotice=<id>` so the app marks it read on open. External or
 * non-allowlisted urls fall back to the inbox.
 */
function resolveDataUrl(noticeId: string, url: string | undefined): string {
  if (!url) return INBOX_URL;
  // The notice's own announcement page is inherently safe (derived from the
  // payload's own noticeId), so it is accepted directly without going through
  // the generic allowlist; that page marks itself read, so no `fromNotice`.
  if (url === inspectorNoticeDeepLink(noticeId)) return url;
  // Any other target must pass the shared allowlist (exact, no normalization);
  // a non-notice target carries `?fromNotice` so the app marks the notice read.
  if (!isAllowedInspectorNoticeTargetPath(url)) return INBOX_URL;
  return `${url}?fromNotice=${noticeId}`;
}

export function buildNotification(text: string | null): BuiltNotification {
  const payload = parsePayload(text);
  if (!payload) {
    return {
      title: 'Properfy',
      options: {
        body: 'You have a new announcement.',
        tag: 'notice',
        data: { url: INBOX_URL },
      },
    };
  }
  return {
    title: payload.title,
    options: {
      body: payload.body,
      tag: `notice-${payload.noticeId}`,
      data: { url: resolveDataUrl(payload.noticeId, payload.url) },
      requireInteraction: payload.critical,
      icon: ICON,
      badge: ICON,
    },
  };
}

interface NavigableClient {
  url: string;
  focus: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
  postMessage?: (message: unknown) => void;
}

/**
 * Focus an existing same-origin window and navigate it to `url`; if the client
 * cannot navigate, post a `navigate` message for the app to handle; with no
 * client, open a new window.
 */
export async function resolveClickTarget(
  sw: ServiceWorkerGlobalScope,
  url: string | undefined,
): Promise<void> {
  const target = url ?? INBOX_URL;
  const clients = (await sw.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })) as unknown as NavigableClient[];
  const client = clients[0];
  if (client) {
    await client.focus();
    if (typeof client.navigate === 'function') {
      await client.navigate(target);
    } else {
      client.postMessage?.({ type: 'navigate', url: target });
    }
    return;
  }
  await sw.clients.openWindow(target);
}

export type PushSubscriptionChangeEvent = ExtendableEvent & {
  readonly oldSubscription?: PushSubscription | null;
  readonly newSubscription?: PushSubscription | null;
};

/**
 * The push service rotated or expired the subscription. The SW has no API
 * token, so it only re-subscribes locally (from `newSubscription`, else by
 * re-subscribing with the old key) and messages open windows so
 * `usePushSubscriptionSync` POSTs the fresh subscription. A subscribe failure
 * only messages the windows (the next load re-syncs, or the server revokes on
 * the stale endpoint's 410 and the critical notice falls back to SMS).
 */
export async function handleSubscriptionChange(
  sw: ServiceWorkerGlobalScope,
  event: PushSubscriptionChangeEvent,
): Promise<void> {
  if (!event.newSubscription) {
    const applicationServerKey = event.oldSubscription?.options.applicationServerKey;
    if (applicationServerKey) {
      try {
        await sw.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch {
        // Ignore: messaging the windows below triggers a resync or SMS fallback.
      }
    }
  }
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((c) => c.postMessage({ type: 'push-subscription-changed' }));
}
