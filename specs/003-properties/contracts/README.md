# Contracts: Properties

**Feature**: `003-properties`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/property.ts` and route handlers in `apps/backend/src/modules/property/interfaces/property.routes.ts`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`property-endpoints.md`](./property-endpoints.md) — property CRUD, list, geocode trigger, address autocomplete.
- [`import-endpoints.md`](./import-endpoints.md) — bulk import upload and status polling.

## Conventions

- All paths are prefixed with `/v1`.
- All endpoints require a Bearer JWT (`authMiddleware` preHandler).
- RBAC is enforced at the use-case layer, not at the route.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Mutating endpoints produce audit records via the shared `AuditService`.
- List endpoints paginate with `page`, `pageSize`, `sortBy`, `sortOrder`.
- The import endpoint uses `multipart/form-data` and requires an `Idempotency-Key` header.
