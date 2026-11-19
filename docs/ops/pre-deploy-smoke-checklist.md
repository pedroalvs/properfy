# Pre-Deploy Smoke Checklist

Run this checklist before each production release. Items marked **(DEC)** reference a formal decision record.

---

## 1. Backend (staging API)

- [ ] `GET /health` → 200
- [ ] `POST /v1/auth/login` as AM → 200 + access + refresh tokens
- [ ] `POST /v1/tenants` as AM → 201 + audit record in `audit_logs`
- [ ] `POST /v1/tenants/:id/branches` as AM → 201
- [ ] `GET /v1/audit-logs?limit=10` as AM → list with records
- [ ] `POST /v1/notifications/send` trigger (or queue a test job) → notification delivered or enqueued

---

## 2. Frontend — Portal (Cloudflare preview or staging)

- [ ] Login page renders and authenticates successfully
- [ ] Sidebar, AppShell and navigation render without console errors
- [ ] `/appointments` list loads with data and filters work
- [ ] `/properties` list loads with data
- [ ] `/tenants` list loads; branch creation form (structured address fields) submits without 400

### Map pages (require `VITE_MAPBOX_TOKEN`) **(DEC-046)**

- [ ] `/appointments/map` → pins render, map auto-fits to bounds
- [ ] `/properties/map` → pins render, auto-fit works
- [ ] `/service-groups/map` → select a group → appointments appear as pins, map re-fits
- [ ] Click a pin → popup + list item highlighted; click list item → map pans to pin
- [ ] Empty state (all data filtered out) → instruction message shown
- [ ] Loading state visible during fetch

### URL filter persistence

- [ ] Apply filters on `/appointments`, copy URL, open in new tab → filters restored
- [ ] Same on `/properties` and `/inspectors`

---

## 3. PWA (inspector mobile)

- [ ] Inspector login works
- [ ] Assignment list loads
- [ ] Start inspection → geolocation captured
- [ ] Finish inspection → status transitions to DONE

---

## 4. Notification smoke

- [ ] Create an appointment that triggers a notification → check `notifications` table: status = `SENT` or `PENDING` in queue
- [ ] Verify no PII (recipient address) in structured logs (`notification.skipped_opt_out`)

---

## 5. Permanent geocoding smoke (X02-1)

Mapbox terms only allow storing coordinates obtained in **permanent** mode. Every write path (property create, geocode worker, import-preview verifier, branch save) now requests `permanent=true`. This smoke proves the environment's server-side token can actually do permanent geocoding — a `200` with coordinates is **not** sufficient on its own, because it cannot distinguish "accepted as permanent" from "`permanent` silently ignored".

### Spike record (dev, 2026-10-29)

Run against the dev account with the dev `MAPBOX_ACCESS_TOKEN` (`sk.` server token), address `1 Martin Place, Sydney NSW`:

| Probe | URL | Result |
|---|---|---|
| (a) v5 + permanent | `geocoding/v5/mapbox.places/{q}.json?...&limit=1&permanent=true` | **HTTP 200**, `center = [151.207639, -33.867753]` |
| (b) v5 baseline | same without `permanent` | HTTP 200, identical |
| (c) v5 permanent endpoint | `geocoding/v5/mapbox.places-permanent/{q}.json?...&limit=1` | **HTTP 200** (a non-entitled account 403/404s here → account is entitled) |
| invalid token | (a) with a bad token | HTTP 401 `{"message":"Not Authorized - Invalid Token"}` |
| no result | nonsense query | HTTP 200, `features: []` |

**Decision:** stay on **v5** (`geocoding/v5/mapbox.places` + `permanent=true`); the v6 contingency is not triggered. Error envelope is `{"message": string}`; account-error detection keys on status ∈ {401,403,422} + "permanent" in the message, with a 403 fallback.

### Per-environment check (staging and prod, before promoting)

- [ ] Note the account's **"Permanent Geocoding API"** usage counter (Statistics/Billing) **before** the check.
- [ ] Run the confirmed URL with the env's server-side token:
  ```bash
  curl -sS -w '\n[HTTP %{http_code}]\n' \
    "https://api.mapbox.com/geocoding/v5/mapbox.places/1%20Martin%20Place%2C%20Sydney%20NSW.json?access_token=$MAPBOX_ACCESS_TOKEN&limit=1&permanent=true"
  ```
- [ ] Expect `200` with `features[0].center` **and** the Permanent Geocoding counter to rise (the positive proof — CA9). If the counter does not rise, the account is not entitled: open/confirm the Mapbox permanent-geocoding enablement request before deploying (it may have Sales lead time and blocks F01/F04/F09).
- [ ] Create a property → confirm it reaches `SUCCESS`, has `geocoded_permanently_at` set and `coordinates` populated.
- [ ] Edit the property without changing the coordinate fields → confirm it stays `SUCCESS` (no false `MANUAL`).
- [ ] Save a branch with an address → confirm `addressJson.latitude/longitude` is populated.

### Cost (confirmed 2026-10-28; reconfirm before rollout)

- Permanent geocoding: **US$ 5.00 / 1,000 requests from the first** (US$ 0.005/request, no free tier). Every write path pays this; temporary (autocomplete, connection test) keeps the free tier.
- Daily retry-sweep cost: `(countFailedGeocoding − countBlockedFailedGeocoding) × US$ 0.005`. Measure in prod at rollout and record the number; a value above the agreed threshold is the trigger to revisit the 24 h cool-off (a separate task).

---

## Notes

- Map smokes require `VITE_MAPBOX_TOKEN` configured with allowed URLs for the staging/prod domain.
- This checklist should be completed by the release engineer before merging to `main` and before Fly.io rolling deploy.
- Failed items must block the deploy unless covered by a formal incident or DEC.
