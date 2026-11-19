# Contract delta — service-type routes (`/v1/service-types`)

The **only** HTTP wire change in this task. RBAC unchanged (create/update AM-only; reads as today). Regenerated into `openapi.json` + `api-types.ts` via `pnpm generate:api`.

| Endpoint | Request | Response | Errors |
|---|---|---|---|
| `POST /v1/service-types` | `createServiceTypeSchema` + `defaultDurationMinutes?` (int 5–480; absent → 45 **this task**) | 201 `{data}` with `defaultDurationMinutes` | 400 `VALIDATION_ERROR` "Request payload is invalid"; 403 `AUTH_FORBIDDEN`; 409 code/name (existing) |
| `PATCH /v1/service-types/:id` | `updateServiceTypeSchema` + `defaultDurationMinutes?` | 200 `{data}` | 400; 403; 404 (existing) |
| `GET /v1/service-types`, `GET /v1/service-types/:id` | – | items with `defaultDurationMinutes: number` | unchanged |

## Schema changes (`packages/shared`)

- `createServiceTypeSchema`: `defaultDurationMinutes: z.number().int().min(5).max(480).default(45)` (transitional default until TASK-F04-5 makes it required).
- `updateServiceTypeSchema`: same, `.optional()`.
- `serviceTypeResponseSchema`: `defaultDurationMinutes: z.number().int()`. **Check `.extend()` consumers before editing** (memory: `.extend()` propagates).
- Constants in new `packages/shared/src/constants/service-type.ts`: `SERVICE_TYPE_DURATION_MIN_MINUTES = 5`, `..._MAX_MINUTES = 480`, `..._DEFAULT_MINUTES = 45`.

## Audit

- `service_type.created` carries `after.defaultDurationMinutes`; `service_type.updated` carries `before`/`after`. No RBAC or tenancy change.
