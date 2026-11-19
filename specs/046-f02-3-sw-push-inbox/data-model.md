# Phase 1 Data Model — F02-3

No new persisted entity (client-only slice). The models below are client-side read models and transient browser objects.

## Push control state (`usePushSubscription`)

`PushControlState` (resolved by fixed precedence L-F02-05):

| State | Meaning |
|---|---|
| `ios-needs-install` | iOS Safari eligible and not standalone (no `PushManager`) |
| `unsupported` | no `serviceWorker` / `PushManager` / `Notification` |
| `blocked` | `Notification.permission === 'denied'` |
| `unavailable` | server `vapidPublicKey === null` |
| `on` | a local subscription exists (after VAPID key check) |
| `off` | no local subscription |
| `enabling` / `disabling` | transitional |

Error field: `'save-failed'` (POST failed, rolled back) rendered as an alert.

## Inbox list item (`useMyNotices` → `GET /v1/inspectors/me/notices`)

`{ id, title, body, critical, publishedAt, readAt }`. No `audience`, author, counts or `unreadCount`. Envelope `{ data, pagination }` (helper `paginated`). Ordered by backend (`publishedAt desc`). Only non-archived own notices.

## Unread count (`useUnreadNoticeCount` → `GET /v1/inspectors/me/notices/unread-count`)

`{ count: number }`. Query key `['inspector-notices','unread-count']`; `staleTime 30s`, `refetchOnWindowFocus: true`; invalidated by SW `inspector-notice:received` and after mark-read. Sole source of the badge.

## Notice detail (`GET /v1/inspectors/me/notices/:noticeId`)

Full notice `{ id, title, body, critical, publishedAt, readAt }`; on first load with `readAt == null` → `POST /:id/read` once (guarded per `noticeId`), then invalidate `['inspector-notices']`.

## Browser push subscription

Native `PushSubscription` from `registration.pushManager.getSubscription()` / `subscribe({ userVisibleOnly: true, applicationServerKey })`. Serialized with `toJSON()` for `POST /v1/inspectors/me/push-subscriptions`. VAPID compare: `keysEqual(subscription.options.applicationServerKey, urlBase64ToUint8Array(vapidPublicKey))`.

## Push payload (from server, read in SW)

`{ v: 1, noticeId, title, body, critical, url }`. `url` already resolved by the backend to an allowlisted target or the inbox. SW re-validates with the shared allowlist before opening.

## Notification options (built by `buildNotification`)

`{ title, options: { body, tag: 'notice-<id>'|'notice', data: { url }, requireInteraction: critical, icon, badge } }`. Invalid payload → generic fallback opening `/profile/announcements`.
