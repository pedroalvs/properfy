# Contracts: Appointments

**Feature**: `006-appointments`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/appointment.ts` and route handlers in `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`appointment-endpoints.md`](./appointment-endpoints.md) — CRUD, state transitions, cross-check, force-confirmation, contacts.
- [`import-endpoints.md`](./import-endpoints.md) — bulk import upload and status polling.

## Conventions

- All paths are prefixed with `/v1`.
- All endpoints require a Bearer JWT (`authMiddleware` preHandler).
- RBAC is enforced at the use-case layer.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Mutating endpoints produce audit records via the shared `AuditService`.
- `POST /v1/appointments/:appointmentId/status-transitions` honors `Idempotency-Key` with 24 h retention, scope `status-transition`.
- `POST /v1/appointments/import` requires `Idempotency-Key` and is rate-limited to 5 req/min per client.
- **Sovereign rule**: every state transition goes through `POST /v1/appointments/:appointmentId/status-transitions`. The only exception is `POST /v1/appointments/:appointmentId/cross-check-done`, which implements the two-person rule on `DONE` appointments and does NOT itself change `status`.
