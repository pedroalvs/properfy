# Contract — `describeGoal` (new shared helper)

`packages/shared/src/lib/goal-copy.ts` — the only new contract artifact in this feature. Pure, I/O-free, barrel-exported, built to `dist/` before web/pwa consume it. Consumed here (Goals list, award list), by the PWA (TASK-F08-4) and by the report (TASK-F08-5).

## Signature

```ts
export function describeGoal(input: {
  metric: GoalMetric;
  target: number;
  scopeLabel: string | null;
}): string;
```

- `scopeLabel` is the region name (REGION_VOLUME) or service-type name (SERVICE_TYPE_VOLUME); `null` means the scope target was deleted (L-F08-13). Other metrics ignore `scopeLabel`.
- `target` is rendered as-is (integer for volume metrics; percentage/points for rate/index — the caller passes the already-correct numeric target; `describeGoal` does not format the number beyond stringifying `{n}`).

## Output strings (per metric)

| Metric | `scopeLabel` | Output |
|---|---|---|
| `VOLUME` | ignored | `Complete {n} inspections` |
| `REGION_VOLUME` | `"Sydney North"` | `{n} inspections in Sydney North` |
| `REGION_VOLUME` | `null` | `{n} inspections in a deleted region` |
| `SERVICE_TYPE_VOLUME` | `"Routine"` | `{n} Routine inspections` |
| `SERVICE_TYPE_VOLUME` | `null` | `{n} inspections of a deleted service type` |
| `INDEX_AT_LEAST` | ignored | `Reliability index of at least {n}` |
| `PUNCTUALITY` | ignored | `Arrive within the window at least {n}% of the time` |
| `GEOFENCE` | ignored | `Check in and out on site at least {n}% of the time` |
| `NO_STUCK` | ignored | `Finish without getting stuck at least {n}% of the time` |
| `SATISFACTION` | ignored | `Tenant satisfaction of at least {n}%` |
| `LATE_NOTICE` | ignored | `Warn ahead when running late at least {n}% of the time` |
| `CANT_DO_MAX` | ignored | `Drop no more than {n}% of jobs` |

## Test matrix (`goal-copy.test.ts`)

- `{ metric: 'REGION_VOLUME', target: 9, scopeLabel: 'Sydney North' }` → `"9 inspections in Sydney North"`.
- `{ metric: 'REGION_VOLUME', target: 9, scopeLabel: null }` → `"9 inspections in a deleted region"`.
- `{ metric: 'SERVICE_TYPE_VOLUME', target: 9, scopeLabel: null }` → `"9 inspections of a deleted service type"`.
- `{ metric: 'SERVICE_TYPE_VOLUME', target: 9, scopeLabel: 'Routine' }` → `"9 Routine inspections"`.
- `{ metric: 'VOLUME', target: 10, scopeLabel: 'ignored' }` → `"Complete 10 inspections"` (scopeLabel ignored).
- One assertion per rate/index metric (`PUNCTUALITY`, `GEOFENCE`, `NO_STUCK`, `SATISFACTION`, `LATE_NOTICE`, `CANT_DO_MAX`, `INDEX_AT_LEAST`) with a representative target, asserting the exact sentence and that `scopeLabel` is ignored.
