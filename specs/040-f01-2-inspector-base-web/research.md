# Phase 0 — Research: Web inspector base address & app adoption

No open NEEDS CLARIFICATION remained after the spec/clarify pass. The task file closed every product decision (D1–D19) and the lacunas (L-F01-01/07/08/09). This file records the technical decisions grounded in the actual post-F01-1 code in this worktree (verified at `cff52a98`).

## D-R1 · The F01-1 contract is already frozen and complete — no `generate:api`

- **Decision**: Consume `packages/shared/src/api-types.ts` as-is. Do not run `pnpm generate:api`.
- **Rationale**: Verified in the worktree — the inspector list item, detail, and write responses in `api-types.ts` already carry `address`, `baseLat`, `baseLng`, `baseGeocodedAt`, `baseGeocodeFailed`, `appInstalledAt`, `appLastSeenAt`, `pushEnabled`, `appVersion` (all optional), and `GET /v1/inspectors` accepts `missingBaseAddress`. Shared exports `AU_STATES`, `AuState`, `inspectorBaseAddressSchema`, `InspectorBaseAddress`, `addressSuggestionSchema`, `createInspectorSchema`, `updateInspectorSchema`, `inspectorSelfUpdateSchema`, `inspectorResponseSchema`, `listInspectorsQuerySchema`. All are reachable from `@properfy/shared` (barrel re-exports `./schemas`).
- **Alternatives considered**: Regenerating defensively — rejected; it would be a no-op diff at best and, if it did diff, would signal an upstream problem to escalate, not to hand-merge (shared-file rule).
- **Consequence**: `address`/`baseLat` on the list item (L-F01-07) lets the "No base address" badge tooltip be decided with no per-row GET.

## D-R2 · The create/edit drawer is out of scope (shipped by F01-1)

- **Decision (confirmed 2026-10-30, spec Clarifications)**: Do not modify `InspectorFormDrawer.tsx`, `useInspectorSave.ts`, or `lib/address.ts`. No address autocomplete, no `AU_STATE_NAME_TO_CODE`, no City-field change.
- **Rationale**: Verified in-worktree — F01-1 already shipped the drawer Base Address section as manual structured AU fields (`AU_STATES` select, Street/Unit/Complement/Suburb/City/State/Postcode, required-on-create, prefill via `readBaseAddress`, save payload with country `'AU'`). The merged `apps/web/CLAUDE.md` §12.9 and the delegation both scope F01-2 to columns + adoption. The pre-F01-1 task file's autocomplete/hidden-City drawer design is superseded by F01-1's implementation choice.
- **Alternatives considered**: Reworking the drawer per the stale task file — rejected by the user (would change F01-1's shipped UX and exceed the delegated scope).

## D-R3 · Sydney timezone for all civil/absolute display

- **Decision**: Format "Last seen" absolute tooltips and detail timestamps in `Australia/Sydney` via the existing `apps/web/src/lib` date helper, independent of browser TZ. Tests pin `TZ` away from Sydney.
- **Rationale**: Platform rule (CLAUDE.md §9, memory "Sydney only"); L-F01-09 requires the "reported at most every 6 h" caveat in the tooltip.
- **Relative formatting**: "3 h ago" / "Never" (null) / "Just now" (future date) computed in `InspectorTable.tsx`, reusing the existing relative/Sydney helper rather than adding a date library.

## D-R6 · New API fields are optional → UI degrades to "—"

- **Decision**: Treat every new field as possibly absent and render "—"/fallbacks.
- **Rationale**: Expand/contract consumer side (Constitution IV); guards against an out-of-order deploy where the web ships before the API rolls everywhere (edge case 5). All fields are typed optional in `api-types.ts`, so this is enforced by the type system, not just convention.

## D-R7 · Typed client, no `as any`

- **Decision**: Consume via the typed `openapi-fetch` client and `api-types.ts` paths; no `as any` (memory WEB-10).
- **Rationale**: Contract-First (Constitution IV); the fields are already typed, so casting would only mask drift.
