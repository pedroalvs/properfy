# Contracts: Inspectors & Execution

**Feature**: `008-inspectors-execution`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/{inspector,inspector-execution}.ts` and route handlers in `apps/backend/src/modules/{inspector,inspector-execution}/interfaces/*.routes.ts`. OpenAPI generated from Fastify is authoritative per constitution Principle IV.

## File layout

- [`inspector-endpoints.md`](./inspector-endpoints.md) — operator endpoints for inspector CRUD, availability slots, user linking, and deactivation.
- [`execution-endpoints.md`](./execution-endpoints.md) — PWA endpoints for schedule, start/finish inspection, asset upload/confirm, and the marketplace offers alias.

## Conventions

- All paths prefixed with `/v1`.
- All endpoints require a Bearer JWT.
- Inspector endpoints: AM or OP (with some CL read access).
- Execution endpoints: INSP only, with `inspectorId` in the token.
- `POST /v1/inspector/appointments/:id/start` and `POST /v1/inspector/appointments/:id/finish` require `Idempotency-Key` header.
- Error envelope: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Mutating endpoints produce audit records via the shared `AuditService`.
