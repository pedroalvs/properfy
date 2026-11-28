# Runbook: legacy permanent re-geocoding (`regeocode-permanent`)

**Script**: `apps/backend/src/scripts/regeocode-permanent.ts` (TASK-X02-2)
**Purpose**: bring legacy stored coordinates into Mapbox permanent-mode compliance — re-geocode legacy properties and branches, restore false-`MANUAL` rows, strip temporary coordinates from committed import previews, and bulk-resume account-blocked properties.

> **Gate**: run only after TASK-X02-1 is deployed to the target environment (dev → staging → prod) and the Mapbox account's permanent mode is confirmed by positive proof (the "Permanent Geocoding API" counter rising — recorded in `docs/ops/pre-deploy-smoke-checklist.md`). The script is **dry-run by default**; `--apply` is required to write.

## Invocation

```bash
# local checkout (runs the TypeScript source via tsx)
pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts [options]
# inside a deployed machine (runs the bundled artifact) — DEV shown; staging/prod
# use -a properfy-api-staging / -a properfy-api. The script is bundled by tsup to
# dist/regeocode-permanent.js (dist ROOT, not dist/scripts/).
fly ssh console -a properfy-api-dev -C "cd /app && node apps/backend/dist/regeocode-permanent.js [options]"
```

> The in-container artifact is `apps/backend/dist/regeocode-permanent.js` (emitted by the `regeocode-permanent` entry in `apps/backend/tsup.config.ts`). It is only present once that entry is built & shipped — a build without it leaves OPS with no artifact to run.

Options: `--apply`, `--entities=properties,branches,false-manual`, `--false-manual-tolerance-m=5`, `--strip-import-previews`, `--retry-failed-permanent`, `--tenant=<uuid>`, `--limit=<n>` (per phase), `--rate=120`, `--move-threshold-m=25`. Exit codes: `0` ok, `1` account error / Mapbox not configured / unexpected, `2` bad argument or incompatible combination. See `specs/044-x02-2-legacy-regeocode/contracts/cli-regeocode-permanent.md`.

**Verify the bundle before an OPS run** (no DB, no Mapbox — arg-parse only exits before any DB/Mapbox access):

```bash
pnpm --filter backend build
node apps/backend/dist/regeocode-permanent.js --rate=0   # prints an arg error, exits 2 → the artifact bundled & boots
```

## Address rule (rule A, O-14)

A geocode is accepted only when it is an **`address`** with **relevance ≥ 0.8** AND it lands in the informed suburb by EITHER: (a) its returned **locality** (Mapbox `context` `locality.*`) matches the informed suburb, OR (b) its returned **place** (`place.*`) matches the informed suburb AND its returned **postcode** (`postcode.*`) equals the informed postcode. The locality/place/postcode are now read **separately** (no longer collapsed). The place+postcode branch is the CBD case: Mapbox returns a finer locality like `The Rocks` while the address is registered at the place level `Sydney`, so the place + postcode confirm it (e.g. `100 George St, Sydney 2000` accepts; `30 Bridge St, Sydney 2000` → `Rydalmere 2116` rejects). Suburb matching is exact after normalizing case/accents/hyphens; postcode matching is exact after trimming. A result matching neither branch is rejected reusing `LOW_RELEVANCE`; a non-address level is `COARSE_RESULT`. The geocoding **query** also drops an Address Line 2 that merely repeats the street (bad-import shape) — query-only, the stored `address_line_2` is unchanged. The report adds two measurement counters: `lineTwoOmitted` (queries where L2 was dropped) and `rejectedSuburbMismatch` (address rejections caused by the suburb), and each rejected entry records the `returnedSuburb` (the returned locality, falling back to the returned place). A re-reject never deletes an existing legacy coordinate.

## Cost

Permanent geocoding costs **US$ 0.005 per request, no free tier** (reconfirm the current Mapbox price before each rollout). A dry-run fills `estimatedRequests` in the report:

```
cost ≈ estimatedRequests.total × US$ 0.005
```

**Threshold**: if the dry-run estimate exceeds **US$ 200**, get explicit dev sign-off before running `--apply` in prod. Use `--limit` and `--tenant` to stage the spend if needed.

## Rate limit

The Mapbox v5 account limit is 600 req/min by default (import previews share it). `--rate` defaults to **120** (one fifth). A `429` triggers a single 60-second wait and one retry of the same row; a second failure is recorded in `errors`. Record the account's real limit here once confirmed: _<fill in at rollout>_. Run outside Sydney business hours.

## Rollout (staging → prod)

1. Confirm TASK-X02-1 is in production for the environment.
2. **Staging**:
   - `… --strip-import-previews` (dry-run) → review counts, incl. `falseManual.auditCandidates`, `missingAudit`, audit-only `ambiguous`.
   - `… --apply --limit=20 --strip-import-previews` → review the report and spot-check a few pins.
   - `… --apply --strip-import-previews` (full) → then re-run and confirm `scanned: 0`.
3. Attach the staging reports. Run the **prod dry-run** via `fly ssh console`; compute the cost. Above US$ 200 → dev sign-off.
4. **Prod**: same script, outside Sydney business hours.
5. Hand operations the lists below for manual correction, and record that the prod report (`moved`, `noResult`, `falseManual.ambiguous`, `falseManual.missingAudit`) plus the count of active properties still without `geocoded_permanently_at` is the **input to the F03 geofence BLOCK audit** (dec. 18) — BLOCK stays off until that audit is done.
6. If the account refuses at any point: fix the account, then `… --retry-failed-permanent --apply`.

## Expected `coordinates_differ` from `postcode`/`addressLine2` changes (do NOT raise the tolerance)

The `property.updated` audit does not store `postcode` or `addressLine2`, so a false-`MANUAL` transition that changed only one of those passes Proof 1 (address "unchanged") but the re-written pin was the **previous** address's. Proof 2 then usually reports `coordinates_differ`. **This is intentional.** Do not raise `--false-manual-tolerance-m` to "fix" the count — a larger tolerance would wrongly restore legitimate `MANUAL` pins. Those rows belong in manual review.

## Manual correction recipe (operations)

From the report, correct these lists (prioritize `falseManual.ambiguous` entries with `addressChangedAfterTransition: true`):

- **Property** in `noResult`, `falseManual.ambiguous` or `falseManual.missingAudit`: in the web, open the property, **clear Latitude and Longitude and save**. For a `MANUAL` row this unlocks it to `PENDING`, which the permanent worker then geocodes; for a `noResult` row it re-queues a fresh permanent attempt. A `missingAudit` `MANUAL` that is genuinely operator-entered should be left as-is.
- **Branch** in `branches.noResult`: re-open the branch and **save the address** so it re-geocodes.

## Rollback

No automatic rollback. Previous coordinates are in the `*.geocode_permanent_backfilled` / `property.false_manual_restored` audit `before` payloads and can be re-applied by SQL (which must also update `coordinates` via the repository path, never a bare `UPDATE`). A wrongly re-geocoded row is corrected by setting `MANUAL` (property) or editing the address (branch). The `preview_json` strip is irreversible and affects no live flow.

## Idempotency & safety notes

- Idempotent via the `geocoded_permanently_at` marker and the `LEGACY_PERMANENT_NO_RESULT` code; interrupting and re-running is safe.
- Every coordinate write is a compare-and-set on `updated_at` + keeps the PostGIS `coordinates` column consistent (writes go through the repository only).
- `noResult` rows keep their legacy (temporary) coordinate until manually corrected — an accepted residual terms violation (dec. 5). Hand the list to operations.
