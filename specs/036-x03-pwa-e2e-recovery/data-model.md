# Phase 1 Data Model — E2E fixtures ↔ shared schemas

The E2E suite has no persistent data model. Its "data" is the set of **response fixtures** that mock
the API, each of which MUST match the canonical `@properfy/shared` response schema for its route (so
a mock can never drift from the contract). Fixtures live in `apps/pwa/tests/e2e/support/fixtures.ts`
(pure — no `@playwright/test` import) and are validated by `apps/pwa/src/__tests__/e2e-fixtures.test.ts`.

## Fixture → schema → route map

| Fixture | Schema (`@properfy/shared`) | Route | Envelope |
|---|---|---|---|
| `INSPECTOR_ME` | `meResponseSchema` (`responses.ts:105`), complete: `id` uuid, `name`, `email`, `role:'INSP'`, `tenantId`, `branchId`, `totpEnabled`, `phone`, `status`, `lastLoginAt`, `createdAt`, `inspectorId` uuid, `timezone:'Australia/Sydney'`, `personalTimezone` | `GET /v1/me` | **plain** (no `data`) |
| `SCHEDULE_MONTH_EMPTY`, `SCHEDULE_MONTH_ONE` | `inspectorScheduleMonthResponseSchema` (`responses.ts:895`) | `GET /v1/inspector/schedule/month` | `{ data: { today, from, to, days, appointments, overdueAppointments } }` |
| `OFFER` | `marketplaceOfferResponseSchema` (`responses.ts:657`) | item of `GET /v1/marketplace/offers` | `{ data, pagination }` |
| `OFFER_DETAIL` | `marketplaceOfferDetailResponseSchema` (`responses.ts:708`) | `GET /v1/marketplace/offers/:groupId` | `{ data }` |
| `APPOINTMENT_DETAIL` | `inspectorAppointmentDetailResponseSchema` (`responses.ts:492`) | execution detail | `{ data }` |
| `FINISH_RESULT` | `finishInspectionResponseSchema` (`responses.ts:909`) | `POST …/finish` | `{ data }` |
| `LOGIN_401` | **local** test schema for `{ error: { code, message, details? } }` (shared exports no error schema; contract = root `CLAUDE.md` §9) | `POST /v1/auth/login` → 401 | error envelope |
| `INSPECTOR_PROFILE` | no backend response schema (`GET /v1/inspectors/me`; typed in `features/profile/hooks/useInspectorMe.ts`). **Not called by any of the 4 current specs** (profile-screen query only), so it is deferred — the fixture + stub are added by the first spec/feature that navigates to a profile screen (F04-3b or a profile spec), per the baseline-ownership rule | `GET /v1/inspectors/me` (not a boot call) | per the hook |

## Format rules

- **Ids**: valid uuid v4 literals, e.g. `'00000000-0000-4000-8000-0000000000NN'` (the shared
  `civilDateStr`/`instantStr` helpers in `responses.ts:39-54` are private/not exported, so fixtures
  use literal strings in the format those helpers accept).
- **Civil dates**: `'YYYY-MM-DD'`. **Instants**: ISO strings (`…Z`).
- **Timezone**: `INSPECTOR_ME.timezone = 'Australia/Sydney'` (app is Sydney-only).

## Validation rules (`e2e-fixtures.test.ts`, written red first — T1–T5)

- T1: `meResponseSchema.strict().parse(INSPECTOR_ME)` does not throw; the legacy fixture
  (`id:'user-1'`, 5 fields) throws `ZodError` on `id` (uuid) and the missing required fields.
- T2: one line per fixture — `schema.strict().parse(fixture)` does not throw.
- T3: `meResponseSchema.strict().parse({ ...INSPECTOR_ME, legacyField: 1 })` throws `ZodError`
  (`code: 'unrecognized_keys'`) — proves `.strict()` is active.
- T4: `LOGIN_401` parses against the local error-envelope schema; `code === 'AUTH_INVALID_CREDENTIALS'`.
- T5: `pnpm --filter pwa test -- e2e-fixtures` lists the file with ≥ 10 passing tests.

**Known limitation (Zod 3)**: `.strict()` enforces no-extra-keys only at the top object level; nested
objects keep `strip`. Dead keys inside nested objects are not caught. Documented in a comment in the
validator.
