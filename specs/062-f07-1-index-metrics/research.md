# Phase 0 Research: Reliability Index Metrics (TASK-F07-1)

All product decisions are settled in `fase2-etapa1/tarefas/F07-tarefas.md` (plan 2026-10-27; dev P1–P11 2026-10-28; gaps L-F07-01…09 2026-10-29; reconciliation R1–R7 2026-10-29). No `NEEDS CLARIFICATION` remained after `/speckit.clarify`. This file records the non-obvious engineering decisions and the alternatives rejected.

## R-1 · Attribution of a DONE occurrence

- **Decision**: Attribute each service to the inspector of **that DONE**, resolved from `appointments.inspector_id` for the current DONE, or `metadata.releasedInspectorId` of the paired `DONE → REJECTED` `status_transition` for a later-rejected DONE. `CANT_ATTEND` uses `inspector_field_events.inspector_id`; `NO_SHOW_REJECTED` uses `metadata.releasedInspectorId` of the `SCHEDULED → REJECTED` transition.
- **Rationale**: Block 7c of `execute-status-transition.use-case.ts` nulls `appointments.inspector_id` on **every** transition to REJECTED/CANCELLED (incl. `DONE → REJECTED`). After a re-offer, the execution row belongs to a different inspector than the new DONE (unique-execution block). Neither `appointments.inspector_id` nor `inspection_executions.inspector_id` is a reliable attribution source for rejected/re-offered services.
- **Alternatives rejected**: (a) attribute by `appointments.inspector_id` — loses every `DONE → REJECTED` and `CANT_ATTEND` (null after block 7c); (b) attribute by `inspection_executions.inspector_id` — credits the wrong inspector after a re-offer. Both are covered by failing contra-proofs in the domain (test 10) and DB (test 12) suites.

## R-2 · One-pass facts reader (fixed query count)

- **Decision**: Load the whole universe in **seven** `$queryRaw` queries (Q1a/Q1b current DONE, Q2 later-rejected DONE, Q3 `CANT_ATTEND`, Q7 OP no-show, then Q4 plan stops, Q5 surveys, Q6 late-notices keyed by the appointment ids from Q1–Q3+Q7), independent of inspector count. `loadCompletedCounts` is one extra query, used only by the single-inspector / filtered / explicit-`inspectorIds` paths.
- **Rationale**: SC-003 requires identical query count for 1 vs 50 inspectors (measured by a `$queryRaw` wrapper in the DB test). A per-inspector loop would be N+1.
- **Alternatives rejected**: Prisma fluent API — cannot express timezone-casted civil-date filters, lateral audit pairing by nearest `created_at`, or the `UNION ALL` branches. One mega-query — unreadable and unindexable; the seven-query split lets each query use its own index (`inspection_executions_finished_at_idx`, `(scheduled_date, inspector_id)`, `audit_logs(action)` + `(entity_type, entity_id)`, `(type, created_at)`, `(appointment_id)`, survey unique, `(appointment_id, type, created_at)`, `audit_logs(action)`+`(created_at)` bitmap).

## R-3 · Volume reference = median of active inspectors (P11)

- **Decision**: `volumeReference` is the median `completedCount` of inspectors with ≥ 1 DONE in the period (floor 1; even count = mean of the two middle values), computed **once per run**; a non-null `volumeReferenceOverride` replaces it (scaled by `periodDays/30`, L-F07-09). The fixed value 60 is removed.
- **Rationale**: A fixed reference punishes everyone equally in a slow month; the median self-adjusts to the active population and is a pure function over counts the facts already carry.
- **Alternatives rejected**: Fixed 60 (plan's original) — rejected by dev P11. Mean instead of median — skewed by one very high-volume inspector. Recomputing per inspector — would read the whole population N times.

## R-4 · Pure domain layer (Prisma-free)

- **Decision**: All metric math (`service-weight`, `punctuality`, `geofence-compliance`, `no-stuck`, `late-notice`, `volume-reference`, `volume-prorata`, `metric-failures`, `metrics`, `score`, `build-service-facts`) lives in `domain/` with **no** Prisma import; the reader is a `domain/` port implemented in `infrastructure/`.
- **Rationale**: Constitution §I; and F08 (`computeAll` reuse per goal period) must call the same pure functions. Decimals are converted to `number` at the reader boundary so the domain never sees `Prisma.Decimal`.
- **Alternatives rejected**: Metric math inside the repository — couples math to Prisma, blocks F08 reuse and the `TZ=America/Los_Angeles` domain-only test matrix.

## R-5 · Timezone handling (R3 / N13)

- **Decision**: Service dates and slot windows are agency-timezone civil values; `windowStartAt/EndAt = zonedWallTimeToUtc(scheduled_date, time_slot_*, tenant.timezone)`. Each query pre-filters by instant (`fromLower = (from−1d) 00:00 UTC`, `toUpper = (to+2d) 00:00 UTC`) to use indexes, then filters the exact civil date with `((x AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN from AND to`. `inspectorCreatedOn` is the Sydney civil date of `inspectors.created_at` (inspector has no agency). The snapshot/job timezone (`PLATFORM_TIMEZONE`) is F07-2.
- **Rationale**: Civil dates are wall-clock in the agency timezone (CLAUDE.md §9); the ±1/+2-day instant pre-filter covers any zone −12..+14 and DST shifts while keeping the index usable.
- **Alternatives rejected**: Browser/UTC date math — forbidden by the project timezone rules; `new Date('YYYY-MM-DD')` — timezone-unsafe.

## R-6 · New rejection codes + transition guard

- **Decision**: Add `RejectionReasonCode.INSPECTOR_NO_SHOW` (SCHEDULED→REJECTED, OP/AM, not SYS/CL) and `NOT_EXECUTED` (DONE→REJECTED, AM). Add `allowedRejectionCodesFrom(fromStatus)` in shared; guard in `execute-status-transition.use-case.ts` before any write → `422 REJECTION_CODE_NOT_ALLOWED`; write `metadata.rejectionReasonCode` on REJECTED transitions. The five RBAC sources are unchanged.
- **Rationale**: The reliability metrics need to tell inspector-fault rejections apart from tenant/admin rejections; the metadata is the only forward-safe signal (legacy rows lack the key, so nothing old penalises metric 8). `allowedRejectionCodesFrom` lives in shared so TASK-F07-3's dialog filters by the same source of truth.
- **Alternatives rejected**: Infer no-show from absence of execution — ambiguous (a SCHEDULED that simply has no desfecho is not a no-show); reading the appointment's current `rejection_reason_code` for metric 8 — wrong after a later re-reject, so the paired transition's metadata is read instead.

## R-7 · Privacy by construction (D12 / F03 D10)

- **Decision**: The reader selects **no** latitude/longitude or any coordinate. Facts carry only distances (`geolocation_distance_meters`, `finish_geolocation_distance_meters`), accuracies, the geofence radius snapshot, and flags. Failure `detail` strings carry derived values only (e.g. "420 m from the property (radius 300 m)"), never address/coordinate/agency name, capped at 80 chars.
- **Rationale**: Agency roles must never see inspector GPS (CLAUDE.md §7.9); building the facts without coordinates makes a leak structurally impossible, verified by a privacy test (test 8c).

## R-8 · Index strategy

- **Decision**: Add one expand-only index `inspection_executions(finished_at)` (`@@index([finished_at])` + migration ordered after F03/F04). **No** new `audit_logs` index — existing `(action)` drives the rare `appointment.done_rejected` scan and `(entity_type, entity_id)` the lateral lookups; Q7 uses `(action)`+`(created_at)` bitmap with the `created_at ≥ fromLower` pre-filter.
- **Rationale**: Q1a filters on `finished_at` which has no index today. `done_rejected` rows are rare, so `(action)` suffices. The DB test asserts via `EXPLAIN` (with `SET enable_seqscan = off` in-test) that Q1a's execution branch uses the new index.
- **Alternatives rejected**: A composite `audit_logs` index — unnecessary now (revision 2026-10-28); flagged as a future measurement if `done_rejected`/`status_transition` volume grows (risk noted in spec/tasks). The generated migration must be reviewed so Prisma does not drop `Unsupported()` (PostGIS) indexes (memory `project_prisma_drift_drops_unsupported_indexes`).

## R-9 · Rounding (P9)

- **Decision**: `roundHalfUp(v, d) = Math.round((v + Number.EPSILON) × 10^d) / 10^d` for `v ≥ 0`. Rates stored/displayed at 4 decimals; the score is computed from the **unrounded** rates and rounded to 1 decimal.
- **Rationale**: Rounding the score from already-rounded rates would drift (worked examples pin exact values like 88.3, 87.3, 95.2). `Number.EPSILON` corrects IEEE-754 half-up boundary cases (0.78250 → 78.3, 0.782499 → 78.2).
- **Alternatives rejected**: `toFixed` / banker's rounding — wrong boundary behavior for the pinned examples.
