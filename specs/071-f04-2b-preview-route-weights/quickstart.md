# Quickstart — F04-2b Preview route weights

## Build & verify (inside the worktree)

```bash
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate
pnpm generate:api              # regenerate openapi.json + api-types.ts (must be clean in git after)
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test     # unit + route integration
pnpm --filter backend test:integration:db   # real-DB route + scoping test
```

## Manual check

1. Log in as AM or OP; obtain an access token.
2. `POST /v1/day-plans/preview` with an inspector that has ≥2 SCHEDULED coordinate stops on a day within today..today+14:
   ```bash
   curl -sX POST "$API/v1/day-plans/preview" -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"inspectorId":"<id>","date":"<today+1>","weights":{"travel":1,"windowWait":0,"baseProximity":1}}'
   ```
   → 200 with `data.current` and `data.proposed`, both `etaSource:"MATRIX"`.
3. Repeat with `date` = today-1 → `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE`.
4. Repeat as a CL or INSP token → `403`.
5. Fire 11 requests within a minute → the 11th is `429`.

## Expected contract behaviour

- Exactly one routing Matrix call per request; zero Directions calls (observable in the injected stub's call counts in tests).
- No `day_plans` row created or changed by the preview.
