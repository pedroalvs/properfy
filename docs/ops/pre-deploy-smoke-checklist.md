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

## Notes

- Map smokes require `VITE_MAPBOX_TOKEN` configured with allowed URLs for the staging/prod domain.
- This checklist should be completed by the release engineer before merging to `main` and before Fly.io rolling deploy.
- Failed items must block the deploy unless covered by a formal incident or DEC.
