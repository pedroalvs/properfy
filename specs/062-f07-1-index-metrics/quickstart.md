# Quickstart: Reliability Index Metrics (TASK-F07-1)

## What this slice delivers

A dark backend+shared measurement engine for the inspector reliability index. No endpoint, no job, no UI. Consumed by TASK-F07-2 (snapshot/job/API) and F08 (goals).

## Build & verify (inside the worktree)

```bash
# shared contracts first (web/pwa/backend resolve @properfy/shared from dist)
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared test
pnpm --filter @properfy/shared typecheck
pnpm --filter @properfy/shared lint

# backend (prisma client required before typecheck/tests)
pnpm --filter backend exec prisma generate
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test            # unit + supertest (incl. transition guard)

# real-DB facts reader (Testcontainers; excluded from the normal run)
pnpm --filter backend test:integration:db   # reliability-facts.reader.db.test.ts

# domain suite also with a non-Sydney TZ
TZ=America/Los_Angeles pnpm --filter backend test -- src/modules/reliability/domain

# contract freshness (only the setting schema may change)
pnpm generate:api   # commit packages/shared/openapi.json + api-types.ts if they change

# PR size
git diff --stat origin/develop... | tail -1   # must be < 150 files
```

## Using the engine (for F07-2 / F08 authors)

```ts
const { metricsService } = container.reliability;

// One metric for one inspector, any civil period:
const punctuality = await metricsService.computeMetric('PUNCTUALITY', inspectorId, '2026-11-01', '2026-11-30');

// All inspectors in a period (job path uses computeAllWith inside a tx):
const batch = await metricsService.computeAll('2026-11-01', '2026-11-30');
for (const [inspectorId, comp] of batch.byInspector) {
  const { status, score } = computeReliabilityScore(comp.metrics, reliabilityIndex, comp.volume);
}
```

- The volume reference (`batch.volumeReference`) is computed once and shared by all inspectors.
- Results never contain coordinates; `failures` carry only derived, ≤ 80-char details.

## Worked-example acceptance (unit)

With the six fixtures over `[2026-11-01, 2026-11-30]`, equal weights, `minimumVolume 10`, no override, volume reference = **9.5** (median of 8,9,9,10,10,12):

| Inspector | Status | Score |
|---|---|---|
| Eva | SCORED | 100 |
| Fábio | SCORED | 97.5 |
| Dan | SCORED | 89.0 |
| Ana | SCORED | 88.3 |
| Ben | SCORED | 79.0 |
| Carla | INSUFFICIENT_VOLUME | null |

Weight sensitivity (03.A1): Ana 88.3 → 87.3 (`PUNCTUALITY: 3`) → 86.6 (`VOLUME: 0`) → 83.3 (`volumeReferenceOverride 20`).

## New rejection codes (operator-facing from this PR)

- `INSPECTOR_NO_SHOW` — only on `SCHEDULED → REJECTED` (OP/AM); penalises punctuality + "can't attend".
- `NOT_EXECUTED` — only on `DONE → REJECTED` (AM); the only `DONE → REJECTED` code that penalises metric 8.
- Wrong origin / SYS actor → `422 REJECTION_CODE_NOT_ALLOWED`. The dialog option arrives in TASK-F07-3.
