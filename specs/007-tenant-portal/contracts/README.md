# Contracts: Tenant Portal

**Feature**: `007-tenant-portal`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/tenant-portal.ts` and route handlers in `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`portal-endpoints.md`](./portal-endpoints.md) — all six endpoints: five renter endpoints (token-auth) plus the operator token-generation endpoint (JWT-auth).

## Conventions

- All paths are prefixed with `/v1`.
- **Two different auth schemes coexist** in this feature:
  - **Renter endpoints** (`GET|POST|PATCH /v1/tenant-portal/:token/...`) — **no JWT**. The portal token in the URL path is hashed via SHA-256 and looked up by `createPortalTokenMiddleware`. Rate-limited 30 req/min per client.
  - **Operator endpoint** (`POST /v1/appointments/:appointmentId/portal-token`) — standard Bearer JWT with AM or OP role.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Renter endpoints write audit records with `actorType = ANONYMOUS` and include `ipAddress`. The operator token-generation endpoint writes with `actorType = USER`.
- **Restricted mode** (`isReadOnly = true`) applies when a token is in `EXPIRED` status (past the 7 PM cutoff). The GET endpoint still returns data. Confirm, reschedule, and contact update reject with `PORTAL_ACTION_BLOCKED`. **Exception**: `POST /unavailable` is allowed after cutoff as a late emergency signal and returns `urgentMode = true` to trigger immediate operator/inspector notification.
