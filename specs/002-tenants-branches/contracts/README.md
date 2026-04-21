# Contracts: Tenants & Branches

**Feature**: `002-tenants-branches`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/tenant.ts` and route handlers in `apps/backend/src/modules/tenant/interfaces/tenant.routes.ts`. The OpenAPI document generated from Fastify is authoritative per constitution Principle IV; this directory is a human-readable projection.

## File layout

- [`tenant-endpoints.md`](./tenant-endpoints.md) — tenant CRUD and deactivation endpoints.
- [`branch-endpoints.md`](./branch-endpoints.md) — branch CRUD and deactivation endpoints, including the flat `GET /v1/branches` variant.

## Conventions

- All paths are prefixed with `/v1`.
- All endpoints require a Bearer JWT and go through the `authMiddleware` preHandler.
- The middleware rejects client-role JWTs (CL_ADMIN, CL_USER) for `INACTIVE` tenants; handlers can assume the caller's tenant is `ACTIVE` when the role is CL_ADMIN or CL_USER. AM and OP (`tenant_id = null` per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003) bypass the tenant status check entirely. Superseded phrasing: "rejects client-role and OP JWTs for `INACTIVE` tenants … OP, CL_ADMIN, or CL_USER. AM (`tenant_id = null`) bypasses the tenant status check".
- RBAC rules are enforced **at the use-case layer**, not in the route handler.
- Request and response bodies are JSON; field names are `camelCase`.
- Error envelope on failure: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Mutating endpoints produce audit records through the shared `AuditService`.
- List endpoints paginate with `page`, `pageSize`, `sortBy`, `sortOrder`; responses use the shared `paginated()` helper and carry `page`, `pageSize`, `total`, and `data`.
