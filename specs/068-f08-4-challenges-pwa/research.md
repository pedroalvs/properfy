# Phase 0 — Research: F08-4 Challenges (PWA) + performance messages

All "unknowns" were resolved by reading the merged F08-1 / F02 / F07 code on `develop` (HEAD #1361). No open NEEDS CLARIFICATION remains. Decisions below are the ones that shape the implementation and tests.

## D1 — Endpoint composition & avoiding redundant work

- **Decision**: `GetInspectorProgramUseCase` composes: (a) `InspectorProgramStandingService.getStanding(id, now)` → `standing`; (b) `InspectorProgramStandingService.getActiveGoalProgress(id, now)` → `activeGoals` + `summary.openCashTotal`; (c) `ReliabilityIndexReader.getCurrentIndexes()` (no filter) → `ranking` via the pure anonymiser; (d) a recent-awards reader → `awards[]` (latest 50, `period_end` desc).
- **Rationale**: These are the exact read seams F08-1/F07 expose. `getCurrentIndexes()` returns **platform-wide `position`** regardless of filter (confirmed in `reliability-index.reader.ts` docstring "position is always the platform-wide competition ranking"), so the ranking cohort is correct without any new query.
- **Accepted cost**: `getStanding` computes active progress internally (only to derive `streak.atRisk`) and `getActiveGoalProgress` computes it again for the list — two progress passes for **one** inspector (a handful of `computeAll` calls each). For a single caller this stays well under the 800 ms p95 target; it avoids modifying the merged F08-1 service signature (constitution §V, minimal impact). If review shows a hotspot, a combined `getStandingWithProgress` method is the follow-up, but it is not needed to meet the target.
- **Alternatives rejected**: adding a combined method to the merged standing service now (touches shipped code for no measured benefit); caching across the two calls (premature).

## D2 — Anonymous ranking (03.A3, DV4, L-F08-07)

- **Decision**: a pure `buildAnonymousRanking({ indexes, selfInspectorId, thresholds, snapshotDate })` in `domain/ranking-anonymiser.ts`:
  1. `ranked = indexes.filter(i => i.position !== null)` (platform cohort = every `ACTIVE`+scored inspector; `getCurrentIndexes()` already excludes non-scored from `position`).
  2. `totalRanked = ranked.length`; `self = indexes.find(i => i.inspectorId === selfInspectorId)`.
  3. `myPosition = self?.position ?? null`, `myScore = self?.score ?? null`.
  4. `notRankedReason`: `null` when ranked; else `'NOT_COMPUTED'` when the self entry has no snapshot/row (`status === 'NOT_COMPUTED'`), else `'NOT_ENOUGH_DATA'`.
  5. `cohortTooSmall = totalRanked < RANKING_MINIMUM_COHORT (5)`.
  6. `entries`: when `cohortTooSmall` → `[]`; else `ranked` sorted by `position` asc, then `sha256(snapshotDate + ':' + inspectorId)` asc, mapped to **exactly** `{ position, score, level: resolveInspectorLevel(score, thresholds), isMe: inspectorId === selfInspectorId }` — the `inspectorId` is dropped at the map step and never serialised.
- **Rationale**: the hash tiebreak is stable within a day and independent of name/insertion (DV4). Dropping `inspectorId` at the anonymiser boundary (not just at the Zod serializer) is defence-in-depth; the `.strict()` response schema is the second layer, and the Supertest contract test is the third.
- **Privacy triple-guard**: anonymiser drops ids → `rankingEntrySchema` is `.strict()` with 4 keys → Supertest scans the serialized body for any other inspector's id/name/email/phone and for the keys `inspectorId|id|name|photoUrl|avatarUrl|email|phone`.
- **Competition positions**: `rankSnapshots` already yields competition ranking (ties share a position, next skips). The anonymiser preserves `position` verbatim, so "two at 3 → next 5" holds.

## D3 — Message steps on the existing daily run (03.17, L-F08-01/06)

- **Decision**: three classes implementing `InspectorProgramDailyStep` with `phase: 'MESSAGES'`, appended to the step array passed to `RunInspectorProgramDailyUseCase` in `container.ts`. Order: goal-reached → level-change → streak-risk. The orchestrator already runs only `MESSAGES`-phase steps when `trigger === 'MESSAGES'` and only `COMPUTE` steps otherwise, and the 04:45 run already enqueues the 08:00 `{trigger:'MESSAGES'}` run with a per-day singleton key (`ScheduleMessagesRunStep`). **No new queue/schedule/worker/subscriber.**
- **Goal-reached (L-F08-01)**: reads non-void `reward_awards` with `created_at >= now − 48h` of `ACTIVE` inspectors (a new `IRecentRewardAwardReader`), groups by `(inspectorId, periodEnd)`, one `publish` per group. **Does not** read `ctx.createdAwardIds` (those belong to the 04:45 compute run, empty in the MESSAGES run). The `dedupeKey` by `periodEnd` (not `periodStart`) makes a weekly and a fortnightly award that start the same Monday but end on different days two distinct notices, and makes next-day recovery idempotent.
- **Level-change (L-F08-06, DR4)**: reads only `findLatestSnapshotDate()` + `findByDate(latest)`/`findByDate(latest − 1)` (never a per-inspector history reader). Skips entirely when `latest !== today` (log `warn`). `weightsVersion(row) = stableHash(weights, minimumVolume, toleranceMinutes, volumeReference.source)`; when `prev !== latest` version → skip all (`{reason:'WEIGHTS_CHANGED'}`). For each `ACTIVE` inspector scored on both days with a level change between two non-null levels, suppress when `IRecentProgramNoticeReader.hasRecentNotice('program-level:'+id+':', now − 7d)` (`{reason:'RECENT_MESSAGE'}`), else publish. `created_at >= now−7d` suppresses (exactly-7-days does not, by using `>=` on the "recent" window boundary — matches F02's `created_at >= since`).
- **Streak-risk**: for each `ACTIVE` inspector with `streak.count >= 1`, uses the standing service's streak + `getActiveGoalProgressForMany` to check today is the cycle's period end, the inspector participates in ≥1 active goal of the cycle, and none is `MET_SO_FAR`.
- **Rationale**: matches the F08-1 step contract exactly; isolates each step's failure (the orchestrator awaits sequentially — I wrap each step body in try/catch logging and not rethrowing, so one failing step does not stop the others, per FR-024/spec test 6).
- **Note on orchestrator**: `RunInspectorProgramDailyUseCase.execute` does `for (step) if (phase) await step.run(ctx)` without per-step catch. To guarantee "a failing step does not stop the others" **without modifying merged code**, each step's `run` catches its own errors and logs them (the step is the unit of isolation). This keeps the merged orchestrator untouched.

## D4 — 7-day guard port (L-F08-06)

- **Decision**: `IRecentProgramNoticeReader { hasRecentNotice(dedupeKeyPrefix: string, since: Date): Promise<boolean> }` in `inspector-program/domain`, implemented by `F02RecentProgramNoticeReader` (composition root) delegating to F02's `HasRecentSystemInspectorNoticeUseCase.execute({ dedupeKeyPrefix, since })`. The inspector-program module never touches `inspector_notices` directly (Clean Architecture; the port is the seam).
- **Rationale**: F02 already ships exactly this read (`existsSystemNoticeByDedupeKeyPrefixSince`, counts archived, ignores manual null-dedupe notices). One query per candidate level change (few per day).

## D5 — Notice publishing & truncation

- **Decision**: steps call `PublishSystemInspectorNoticeUseCase.execute({ type:'PERFORMANCE_MESSAGE', inspectorIds:[id], title, body, dedupeKey, targetPath:'/profile/challenges' })`. The use case **trims and rejects** title >120 / body >2000, so `program-message-copy.ts` truncates to 120/2000 with a trailing "…" **before** calling (ellipsis counts toward the limit). `created:false` on repeat gives idempotency; `noticeId:null, created:false` when there are no active recipients.
- **Rationale**: avoids a guaranteed `ValidationError` on long aggregated bodies; keeps copy logic pure and unit-tested.

## D6 — Allowlist entry (DR7, L-F02-08)

- **Decision**: append `'/profile/challenges'` to `INSPECTOR_NOTICE_TARGET_PATTERNS` (a static 3-segment pattern `['','profile','challenges']`) and export `INSPECTOR_CHALLENGES_PATH = '/profile/challenges'`. The existing `isAllowedInspectorNoticeTargetPath` does exact segment matching with trailing-slash/`?`/`//`/case rejection, so the spec's negative cases hold with no matcher change.
- **Rationale**: the matcher is already correct; only the pattern list grows. Done in the same PR as the route (allowlist-with-route rule).

## D7 — PWA feature shape

- **Decision**: `features/challenges/` mirrors `features/earnings/`: one page (`ChallengesPage`) with a `role="tablist"` switching Active / My results / Ranking via `?tab=` (`replace`), a `useInspectorProgram` React Query hook (`staleTime 60_000`, `queryKey ['inspector-program']`), component-per-concern, and a `lib/challenge-copy.ts` for footers + AUD/period formatting. The More tile reads `summary.openCashTotal` from the same hook (only when the hub mounts it). Back button → `/profile` via the PWA master-detail back pattern.
- **Rationale**: consistency with the shipped `earnings`/`announcements` features; the tablist + `aria-valuetext` progressbar satisfy a11y via RTL (no axe in the workspace).

## D8 — Timezones (DR5)

- **Decision**: the backend formats every civil date (`periodStart/End`, `startsOn`, `countsSince`, snapshot date, message period text "Mon 2 Nov") in `PLATFORM_TIMEZONE`; the PWA renders strings as received and never constructs a `Date` for business logic. Message period text is built server-side in `program-message-copy.ts`. TZ-dependent tests pin `TZ=America/Los_Angeles`.

## D9 — Observability (deferred-from-clarify item)

- **Decision**: emit the task's named signals as structured logs: `inspector_program.messages_sent { step, created, deduped, aggregatedAwards }` per step and `inspector_program.level_messages_skipped { reason: 'WEIGHTS_CHANGED' | 'RECENT_MESSAGE' }`, plus a `warn` when today's snapshot is missing. No metric backend change; these are log lines on the existing logger.
- **Rationale**: this was the only item clarify flagged as plan-level; it changes no acceptance test and is satisfied by log assertions where the step tests check skip reasons.

## D10 — api-types regeneration & merge order

- **Decision**: regenerate `openapi.json` + `api-types.ts` with `pnpm generate:api` after the route schema is final; commit both. Merge **before** TASK-F08-5; if F08-5 regenerates first, rebase on `develop` and re-run `pnpm generate:api` rather than hand-merging the generated file.
- **Rationale**: generated-file conflicts are never hand-resolved (memory `project_generated_apitypes_merge`).
