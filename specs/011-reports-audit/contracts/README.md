# Contracts: Reports & Audit

**Feature**: `011-reports-audit`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/{report,audit}.ts` and route handlers in `apps/backend/src/modules/{report,audit}/interfaces/*.routes.ts`. OpenAPI generated from Fastify is authoritative per constitution Principle IV.

## File layout

- [`audit-endpoints.md`](./audit-endpoints.md) — operator audit log list.
- [`report-endpoints.md`](./report-endpoints.md) — request, list, status, download.

## Conventions

- All paths prefixed with `/v1`.
- All endpoints require a Bearer JWT.
- Audit log list is AM/OP only. CL and INSP are forbidden.
- Report endpoints enforce tenant scope for CL roles and role gating for restricted types.
- Error envelope: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Download responses return presigned URLs with a 1-hour TTL.
- Audit response field `actorName` is resolved server-side — clients do not need to cross-reference users.
