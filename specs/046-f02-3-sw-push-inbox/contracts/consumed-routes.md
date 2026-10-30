# Consumed Contracts — F02-3

No contract is defined or changed here. All routes are shipped by TASK-F02-1 and typed in `packages/shared/src/api-types.ts` (verified on `develop` @ b126bd57). The PWA calls them through `openapi-fetch` (`services/api.ts`) / `useApiQuery`.

| Route | Method | Used by | Shape |
|---|---|---|---|
| `/v1/inspectors/me/notices` | GET | `useMyNotices` | `{ data: NoticeListItem[], pagination }` (query `page`, `pageSize`, `status` default active) |
| `/v1/inspectors/me/notices/unread-count` | GET | `useUnreadNoticeCount` | `{ data: { count } }` |
| `/v1/inspectors/me/notices/{noticeId}` | GET | `AnnouncementDetailPage` | `{ data: Notice }` (404 when archived/non-recipient) |
| `/v1/inspectors/me/notices/{noticeId}/read` | POST | `useMarkNoticeRead`, `useNoticeOpenedFromPush` | `{ data: { noticeId, readAt } }` |
| `/v1/inspectors/me/push-config` | GET | `usePushSubscription`, `usePushSubscriptionSync` | `{ data: { vapidPublicKey: string \| null } }` |
| `/v1/inspectors/me/push-subscriptions` | POST | enable, sync, logout(resubscribe) | body = `subscription.toJSON()`; 204 |
| `/v1/inspectors/me/push-subscriptions/unsubscribe` | POST | disable, logout | body = `{ endpoint }`; 204 |

## Shared constants consumed (`@properfy/shared`)

- `isAllowedInspectorNoticeTargetPath(path: unknown): boolean`
- `INSPECTOR_NOTICE_TARGET_PATTERNS` (`/profile/announcements/:id`, `/schedule/:id`)
- `inspectorNoticeDeepLink(noticeId)` = `/profile/announcements/:noticeId`

## From TASK-F01-3

- `getIsStandalone()`, `getIsIosSafariEligible()` from `src/app/useInstallPrompt.tsx`
- `data-testid="push-preference-slot"` in `ProfileSettingsPage.tsx`; `__APP_VERSION__` footer
