# Contracts: Notifications

**Feature**: `009-notifications`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/notification.ts` and route handlers in `apps/backend/src/modules/notification/interfaces/notification.routes.ts`. OpenAPI generated from Fastify is authoritative per constitution Principle IV.

## File layout

- [`notification-endpoints.md`](./notification-endpoints.md) — operator list/detail/retry and template management.
- [`webhook-endpoints.md`](./webhook-endpoints.md) — provider webhooks (Resend, Twilio, Zenvia).

## Conventions

- All paths prefixed with `/v1`.
- Operator endpoints require a Bearer JWT.
- Webhook endpoints are **unauthenticated** — providers cannot carry JWTs. Signature validation per provider is a Phase 2 gap (GAP-007).
- Webhooks always return `200 { received: true }`, even for unknown `provider_message_id`, to avoid provider retry storms.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Recipient fields (`recipient`, `primaryEmail`, `primaryPhone`) are PII and must never appear in production logs.
