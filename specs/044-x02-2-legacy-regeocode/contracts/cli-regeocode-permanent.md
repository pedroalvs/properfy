# CLI Contract: `regeocode-permanent`

**Feature**: `044-x02-2-legacy-regeocode`
**Invocation**: `pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts [options]` (prod: `fly ssh console`).
This is the only external contract — there is no HTTP route, no Zod boundary schema and no OpenAPI change.

## Options

| Option | Default | Effect |
|---|---|---|
| (none) | dry-run | No write, no Mapbox, no enqueue. Counts candidates per phase; fills `estimatedRequests`. |
| `--apply` | off | Executes the selected phases. |
| `--entities=properties,branches,false-manual` | all three | Restricts the re-geocoding phases. `false-manual` is the audit detection. |
| `--false-manual-tolerance-m=<n>` | 5 | Max haversine distance (m) between the MANUAL pin and the permanent geocode to confirm a false MANUAL. |
| `--strip-import-previews` | off | Runs the `preview_json` cleanup. No Mapbox call. |
| `--retry-failed-permanent` | off | Runs **only** the bulk resume. Incompatible with `--entities` / `--strip-import-previews`. |
| `--tenant=<uuid>` | all | Restricts **every** phase (incl. strip and retry) to one tenant. |
| `--limit=<n>` | no limit | Max **selected** entities **per phase** (false-MANUAL, properties, branches). Not a Mapbox-call cap. |
| `--rate=<req/min>` | 120 | Throttle `60000/rate` ms between Mapbox calls. |
| `--move-threshold-m=<n>` | 25 | Haversine distance above which an updated row also counts as `moved`. |

## Exit codes

- `0` — success; the JSON report is printed to stdout.
- `1` — account error (abort), Mapbox not configured, or unexpected error.
- `2` — invalid argument / incompatible combination. Messages: `Invalid argument: <arg>` and `--retry-failed-permanent cannot be combined with <flag>`. Invalid: `--rate<=0`, `--limit<0`, `--false-manual-tolerance-m<=0`, `--move-threshold-m<0`.

## Exported function

```ts
export async function regeocodePermanent(
  deps: {
    prisma: PrismaClient;
    repo: ILegacyRegeocodeRepository;            // the X02-2 methods (data-model.md), impl by PrismaPropertyRepository
    geocoder: IGeocodingService;                 // geocode(address, { mode:'permanent' })
    isGeocoderConfigured: () => Promise<boolean>; // DynamicGeocodingService.isConfigured()
    enqueue: (name: string, data: object, opts?: object) => Promise<unknown>; // sendJob
    auditService: Pick<AuditService, 'log'>;
    logger?: Logger;
    clock?: Clock;
    sleep?: (ms: number) => Promise<void>;        // injectable for fake-timer tests
  },
  options: RegeocodeOptions,
): Promise<RegeocodeReport>;

export function isDirectInvocation(entrypoint: string | undefined): boolean;
```

## `RegeocodeReport`

```ts
interface RegeocodeReport {
  dryRun: boolean;
  estimatedRequests: { falseManual: number; properties: number; branches: number; total: number };
  importPreviews: { scanned: number; stripped: number };
  falseManual: {
    manualWithCoordinates: number;
    auditCandidates: number;
    restored: number;
    moved: number;
    skippedConcurrent: number;
    ambiguous: Array<{ id: string; propertyCode: string; tenantId: string; auditLogId: string;
      reason: 'audit_redacted' | 'address_changed_in_transition' | 'coordinates_differ' | 'no_result' | 'geocode_error';
      distanceM: number | null; transitionedAt: string; addressChangedAfterTransition: boolean }>;
    missingAudit: Array<{ id: string; propertyCode: string; tenantId: string }>;
  };
  properties: { scanned: number; updated: number; moved: number; skippedConcurrent: number;
    noResult: Array<{ id: string; propertyCode: string; tenantId: string }>;
    errors: Array<{ id: string; propertyCode: string; message: string }> };
  branches: { scanned: number; updated: number; moved: number; skippedConcurrent: number;
    noResult: Array<{ id: string; name: string; tenantId: string }>;
    errors: Array<{ id: string; name: string; message: string }> };
  retriedFailedPermanent: number;
  aborted: null | { code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' | 'MAPBOX_NOT_CONFIGURED'; atEntityId: string | null };
}
```

## Phase order

`strip previews` (if requested) → `false-manual` → `properties` (legacy) → `branches`. `--retry-failed-permanent` runs alone. An account error aborts immediately; `isGeocoderConfigured() === false` aborts before any selection.

## Logs (English copy — see spec FR-024)

`regeocode.started`, `regeocode.estimated_requests`, `regeocode.rate_limited_retry` (warn), `regeocode.database` (masked host), `regeocode.import_previews_stripped`, `regeocode.false_manual_classified`, `regeocode.false_manual_processed` (debug), `regeocode.entity_processed` (debug), `regeocode.aborted_account_unavailable` (error), `regeocode.aborted_not_configured` (error, `Mapbox is not configured; refusing to run`), `regeocode.retry_failed_permanent_enqueued`, `regeocode.finished`.

## Audit (only with `--apply`, `actorType: 'SYSTEM'`)

`property.geocode_permanent_backfilled`, `property.false_manual_restored` (`metadata: { auditLogId, distanceM, toleranceM }`), `property.geocode_permanent_no_result` (`metadata: { code:'LEGACY_PERMANENT_NO_RESULT', keptLegacyCoordinates:true }`), `branch.geocode_permanent_backfilled`, `property.geocode_retry_requeued` (`metadata: { previousCode }`). Each carries the affected row's `tenantId`.
