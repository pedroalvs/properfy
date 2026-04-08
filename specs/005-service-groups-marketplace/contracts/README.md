# Contracts: Service Groups & Marketplace

**Feature**: `005-service-groups-marketplace`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/service-group.ts` and route handlers in `apps/backend/src/modules/service-group/interfaces/{service-group,marketplace}.routes.ts`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`service-group-endpoints.md`](./service-group-endpoints.md) — operator-facing service group CRUD and transitions.
- [`marketplace-endpoints.md`](./marketplace-endpoints.md) — inspector-facing offer list and accept action.

## Conventions

- All paths are prefixed with `/v1`.
- All endpoints require a Bearer JWT (`authMiddleware` preHandler).
- RBAC is enforced at the use-case layer, not at the route.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Mutating endpoints produce audit records via the shared `AuditService`.
- List endpoints paginate with `page`, `pageSize`, `sortBy`, `sortOrder`.
- `POST /v1/marketplace/offers/:groupId/accept` honors an optional `Idempotency-Key` header; when omitted, a default key is derived server-side as `accept-offer:{groupId}:{inspectorId}` with 24 h retention.
