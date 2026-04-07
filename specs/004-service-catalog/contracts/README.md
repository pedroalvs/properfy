# Contracts: Service Catalog

**Feature**: `004-service-catalog`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/{service-type,service-region,pricing-rule}.ts` and route handlers under `apps/backend/src/modules/{service-type,service-region,pricing-rule}/interfaces/`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`service-type-endpoints.md`](./service-type-endpoints.md) — global service type catalog.
- [`service-region-endpoints.md`](./service-region-endpoints.md) — **tenant-scoped** service region polygons + resolve endpoint.
- [`pricing-rule-endpoints.md`](./pricing-rule-endpoints.md) — tenant-scoped pricing rules.

## Conventions

- All paths are prefixed with `/v1`.
- All endpoints require a Bearer JWT (`authMiddleware` preHandler).
- RBAC is enforced at the use-case layer, not at the route.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Mutating endpoints produce audit records via the shared `AuditService`.
- List endpoints paginate with `page`, `pageSize`, `sortBy`, `sortOrder`.
- **Scope rules**: service type is **global** (no `tenant_id` — AM-only for create/edit, anyone can read). Service region is **tenant-scoped** (`tenant_id` mandatory per CORRECTION-004; code currently lacks this column — known divergence). Pricing rule is **tenant-scoped**. Consumers should not assume a uniform scoping rule across these endpoints.
