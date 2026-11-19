# HTTP Contracts — Inspector Notices

Error envelope: `{ error: { code, message, details? } }`. Zod → `400 VALIDATION_ERROR` ("Request payload is invalid" | "Invalid query parameters" | "Invalid notice ID"). All routes declare `schema.response` (serializer strips undeclared fields). Instants are ISO-8601 UTC.

## Admin (AM/OP)

### `POST /v1/inspector-notices`
- **Request**: body `publishInspectorNoticeSchema` `{title, body, critical?, audience}`; header **mandatory** `Idempotency-Key` (scope `inspector-notice.publish`, TTL 24h).
- **Response**: `201 {data: inspectorNoticeSummarySchema}` (`readCount:0`).
- **Errors**: `400 IDEMPOTENCY_KEY_MISSING` "Idempotency-Key header is required"; `409 INSPECTOR_NOTICE_IDEMPOTENCY_PAYLOAD_MISMATCH` "This Idempotency-Key was already used with a different request"; `400 VALIDATION_ERROR`; `400 INSPECTOR_NOTICE_INVALID_RECIPIENTS` "Some selected inspectors are not active" (`details.inspectorIds`); `404 INSPECTOR_NOTICE_REGION_NOT_FOUND` "Region not found"; `422 INSPECTOR_NOTICE_REGION_INACTIVE` "This region is inactive"; `422 INSPECTOR_NOTICE_NO_RECIPIENTS` "No active inspectors match this audience".
- **RBAC**: AM, OP. Others `403 FORBIDDEN` "Insufficient permissions".

### `GET /v1/inspector-notices`
- **Request**: query `listInspectorNoticesQuerySchema` (`status` active|archived|all default active; pagination; `pageSize` max 100).
- **Response**: `200 {data: inspectorNoticeSummarySchema[], pagination:{page,pageSize,total,totalPages}}`.
- **RBAC**: AM, OP.

### `GET /v1/inspector-notices/:noticeId`
- **Request**: params `{noticeId: uuid}`.
- **Response**: `200 {data: inspectorNoticeDetailSchema}` (`recipients[]` each `{inspectorId, inspectorName, readAt, inspectorStatus, hasAppAccess}`, unread-first then name asc).
- **Errors**: `400` "Invalid notice ID"; `404 INSPECTOR_NOTICE_NOT_FOUND` "Notice not found".
- **RBAC**: AM, OP.

### `POST /v1/inspector-notices/:noticeId/archive`
- **Request**: params; no body (absent or `{}` accepted).
- **Response**: `200 {data: inspectorNoticeSummarySchema}` with `archivedAt`. Already archived → `200` idempotent (same value, no new audit).
- **Errors**: `404 INSPECTOR_NOTICE_NOT_FOUND`.
- **RBAC**: AM, OP.

> No `PATCH`/`DELETE /v1/inspector-notices/:id` (D4) — Fastify 404.

## Inspector box (INSP, own)

### `GET /v1/inspectors/me/notices`
- **Request**: query `listMyInspectorNoticesQuerySchema` (pagination; `sortBy` ignored).
- **Response**: `200 {data: myInspectorNoticeSchema[], pagination}` — own non-archived, `published_at desc`. **No** `unreadCount`.
- **Errors**: `400`; `403 INSP_ONLY` "This endpoint is only accessible to inspectors".
- **RBAC**: INSP (own).

### `GET /v1/inspectors/me/notices/unread-count`
- **Response**: `200 {data:{count:number}}`. **RBAC**: INSP.

### `GET /v1/inspectors/me/notices/:noticeId`
- **Response**: `200 {data: myInspectorNoticeSchema}`.
- **Errors**: `404 INSPECTOR_NOTICE_NOT_FOUND` (not recipient **or** archived — no existence leak); `403 INSP_ONLY`.

### `POST /v1/inspectors/me/notices/:noticeId/read`
- **Response**: `200 {data:{noticeId, readAt}}` (idempotent, first `read_at` wins). No audit.
- **Errors**: `404 INSPECTOR_NOTICE_NOT_FOUND`; `403 INSP_ONLY`.

## Push subscriptions (INSP, own)

### `GET /v1/inspectors/me/push-config`
- **Response**: `200 {data: {vapidPublicKey: string|null}}`. **RBAC**: INSP.

### `POST /v1/inspectors/me/push-subscriptions`
- **Request**: `pushSubscriptionSchema` `{endpoint(https,≤2048), expirationTime?, keys:{p256dh,auth}}`.
- **Response**: `204`.
- **Errors**: `400`; `403 INSP_ONLY`; `503 PUSH_NOT_CONFIGURED` "Push notifications are not configured"; `429` (10/min per user).

### `POST /v1/inspectors/me/push-subscriptions/unsubscribe`
- **Request**: `pushUnsubscribeSchema` `{endpoint}`.
- **Response**: `204` (idempotent no-op if unknown/foreign).
- **Errors**: `400`; `403 INSP_ONLY`; `429` (10/min).

> `unsubscribe` is a POST (not DELETE-with-body) because some clients/proxies drop DELETE bodies.

## Routing note

Static `/v1/inspectors/me/notices*` and `/v1/inspectors/me/push-*` must NOT be captured by `/v1/inspectors/:inspectorId` (find-my-way static-wins; covered by a precedence test).

## RBAC matrix (bodies always valid so 400 doesn't mask 403)

| Route | AM | OP | CL_ADMIN | CL_USER | INSP | no token |
|---|---|---|---|---|---|---|
| `POST /v1/inspector-notices` | 201 | 201 | 403 | 403 | 403 | 401 |
| `GET /v1/inspector-notices` | 200 | 200 | 403 | 403 | 403 | 401 |
| `GET /v1/inspector-notices/:id` | 200 | 200 | 403 | 403 | 403 | 401 |
| `POST /v1/inspector-notices/:id/archive` | 200 | 200 | 403 | 403 | 403 | 401 |
| `GET /v1/inspectors/me/notices` (+ `/unread-count`, `/:id`, `/:id/read`) | 403 INSP_ONLY | 403 | 403 | 403 | 200 | 401 |
| `GET …/push-config`, `POST …/push-subscriptions`(+ `/unsubscribe`) | 403 INSP_ONLY | 403 | 403 | 403 | 200/204 | 401 |
