# Contract — `GET /v1/inspector/program`

**Actor**: INSP only (`inspector_program.view_own`), via a local `requireLinkedInspector` helper (same codes/messages as `inspector-execution`). **No query parameters. Read-only** (no side effect).

**Schema**: `inspectorProgramResponseSchema` in `packages/shared/src/schemas/inspector-program.ts`, registered on the Fastify route as `schema.response[200]` via `fastify-type-provider-zod`; regenerated into `openapi.json` + `api-types.ts` with `pnpm generate:api`.

## 200 response

```ts
{
  generatedAt: string;              // UTC ISO instant
  timezone: 'Australia/Sydney';
  summary: { openCashTotal: number; currency: 'AUD' };
  activeGoals: Array<{
    goalId: string; title: string; description: string;   // description rendered server-side (describeGoal)
    metric: GoalMetric; comparator: GoalComparator; target: number;
    periodType: BillingPeriodType; periodStart: string; periodEnd: string; daysLeft: number;  // civil dates, PLATFORM_TIMEZONE
    rewardAmount: number; value: number | null; serviceCount: number; minimumServices: number | null;
    state: 'MET_SO_FAR' | 'IN_PROGRESS' | 'BELOW_TARGET' | 'NOT_ENOUGH_SERVICES' | 'NO_DATA' | 'UPCOMING';
    startsOn: string | null;        // civil date; non-null iff state === 'UPCOMING'
    countsSince: string | null;     // civil date; periodStart when the goal began mid-period, else null
  }>;
  standing: {
    index: { score: number | null; status: 'SCORED' | 'INSUFFICIENT_VOLUME' | 'NO_WEIGHTED_DATA' | 'NOT_COMPUTED'; snapshotDate: string | null };
    level: InspectorLevel | null;
    streak: { cycle: BillingPeriodType | null; count: number; atRisk: boolean };
  };
  awards: Array<{                   // latest 50, period_end desc
    goalTitle: string; metric: GoalMetric; periodType: BillingPeriodType; periodStart: string; periodEnd: string;
    amount: number; achievedValue: number; status: RewardAwardStatus;
    paidAt: string | null; voidedAt: string | null; inspectorNote: string | null;   // never voidReason
  }>;
  ranking: {
    myPosition: number | null; myScore: number | null; totalRanked: number;
    notRankedReason: 'NOT_ENOUGH_DATA' | 'NOT_COMPUTED' | null;
    cohortTooSmall: boolean;        // true when totalRanked < 5
    entries: Array<{ position: number; score: number; level: InspectorLevel | null; isMe: boolean }>;  // .strict(); [] when cohortTooSmall
  };
}
```

## Errors (envelope `{ error: { code, message, details? } }`)

| Status | Code | When |
|---|---|---|
| 401 | (auth) | No/invalid token |
| 403 | `FORBIDDEN` | Caller is not INSP (incl. AM, OP, CL_ADMIN, CL_USER, TNT) — message "Only inspectors can view their program" |
| 400 | `INSPECTOR_NOT_LINKED` | Caller is INSP with no linked inspector |

## Invariants (asserted by tests)

- **03.A3**: the serialized body contains no other inspector's `id`, `name`, `email` or `phone`; a recursive key scan finds none of `inspectorId | id | name | photoUrl | avatarUrl | email | phone`; each `ranking.entries[i]` has exactly the four keys `position, score, level, isMe` (`.strict()`).
- **Cohort**: `ranking` cohort is every `ACTIVE` inspector with a scored index platform-wide (`getCurrentIndexes()` with no filter); `totalRanked < 5` ⇒ `cohortTooSmall:true`, `entries:[]`, but `myPosition`/`myScore` still returned.
- **Tie order**: `entries` ordered by `position` asc then `sha256(snapshotDate + ':' + inspectorId)` asc — stable within a day, independent of name/insertion; competition positions preserved (two at 3 → next 5).
- **openCashTotal**: sum of `rewardAmount` over current-period participated goals only (not `UPCOMING`), no cap.
- **Dates**: all civil dates are `PLATFORM_TIMEZONE` from the backend; `generatedAt`/`paidAt`/`voidedAt` are UTC.
- **Read-only**: no write occurs; auditing is N/A for this endpoint (writes happen only in the F02 notice use case).
- **Performance**: p95 < 800 ms in staging; client `staleTime 60_000`.
