# Contracts: Billing & Ledger

**Feature**: `010-billing-ledger`
**Status**: IMPLEMENTED
**Source of truth**: Zod schemas in `packages/shared/src/schemas/billing.ts` and route handlers in `apps/backend/src/modules/billing/interfaces/billing.routes.ts`. OpenAPI generated from Fastify is authoritative per constitution Principle IV.

## File layout

- [`financial-entry-endpoints.md`](./financial-entry-endpoints.md) — list, read, summary, approve, adjust, refund.
- [`invoice-endpoints.md`](./invoice-endpoints.md) — generate, list, read, download inspector invoices.

## Conventions

- All paths prefixed with `/v1`.
- All endpoints require a Bearer JWT.
- Entry mutation endpoints (`approve`, `adjust`, `refund`) are AM/OP only.
- Invoice generation is AM/OP only.
- `POST /v1/financial/entries/adjust` and `POST /v1/financial/entries/:id/refund` support optional `Idempotency-Key` headers.
- Error envelope: `{ "error": { "code": string, "message": string, "details"?: object } }`.
- Amounts in request/response bodies are numbers with 2 decimal places. Clients must be careful with floating-point parsing — parse as strings when necessary.
- **Duplicate invoice paths**: `/v1/invoices/*` and `/v1/billing/invoices/*` coexist (legacy). Both delegate to the same use cases. New clients should prefer `/v1/billing/invoices/*`.
