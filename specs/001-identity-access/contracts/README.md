# Contracts: Identity & Access

**Feature**: `001-identity-access`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/{auth,user}.ts` and route handlers in `apps/backend/src/modules/{auth,user}/interfaces/*.routes.ts`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`auth-endpoints.md`](./auth-endpoints.md) — authentication, session, 2FA, and profile endpoints.
- [`user-endpoints.md`](./user-endpoints.md) — user CRUD and admin password reset endpoints.

## Conventions

- All paths are prefixed with `/v1`.
- Authenticated endpoints require a Bearer JWT and go through the `authMiddleware` Fastify preHandler.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Rate limits are **hybrid**: per IP AND per account/email (for login) or per session (for refresh). Exceeding any limit returns HTTP 429 with the shared error envelope and a `Retry-After` header where applicable. See FR-005 (lockout) and FR-019 (hybrid rate limit) for the binding rules.
- All mutating endpoints produce an audit record through the shared `AuditService`.
- The `request_id` header (generated or propagated by the Fastify plugin) is echoed in logs and job payloads.
