# Round 3 Production-Readiness Report — 2026-04-23

## Summary

All pre-existing gaps from Round 2 were closed with real, runnable test assertions.
Backend test suite: **3402/3402 green, no asterisk**.
CI: all 8 jobs green. Staging deployed and smoke-tested.

---

## Fixes Delivered (Round 3 — on top of Round 2)

| Fix | Files | Key Assertions |
|---|---|---|
| **Spec 018 T042/T043/T068** — unsubscribe public flow | `apps/backend/tests/integration/notification/unsubscribe-public-flow.routes.test.ts` (NEW, 11 tests) | GET confirm page (data-state="confirm", recipient, form); form POST opt-out (data-state="success", re-opt-in link, processUnsubscribe args); JSON POST returns structured body; expired/tampered token → 200 HTML with correct state, never 400/500; re-opt-in round-trip; retry SKIPPED_OPT_OUT → SENT after re-opt-in; public routes never call jwtVerify |
| **Contacts trigram SQL** — CI integration-db failure | `apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts` | Replaced nested `$queryRaw` with `Prisma.sql` fragment for conditional type clause; fixes Postgres syntax error 42601 in real-DB job |
| **Service region inspector methods** — CI integration-db failure | `apps/backend/src/modules/service-region/domain/service-region.repository.ts` + `infrastructure/prisma-service-region.repository.ts` | Added `findAllByInspector` and `countByInspector` to interface and implementation; closes T145/T175 real-DB tests |

---

## Commits (staging branch)

| Hash | Message |
|---|---|
| `784db40` | test(feedback-round-2): close 7 FAIL specs with TDD evidence — 21/21 PASS |
| `7548505` | test(018): add unsubscribe-public-flow.routes.test.ts closing T042/T043/T068 |
| `4471af5` | fix(contacts): use Prisma.sql fragment for conditional type clause in trigram search |
| `87e6fa4` | feat(service-region): add findAllByInspector and countByInspector to repository |

---

## CI Gates (run 24820407251)

| Job | Result |
|---|---|
| Lint & Typecheck | **PASS** |
| Prisma schema validation (syntax) | **PASS** |
| Prisma migrate deploy (fresh DB) | **PASS** |
| Test shared | **PASS** |
| Test backend | **PASS** — 3402/3402 |
| Test web | **PASS** |
| Integration tests (real DB via testcontainers) | **PASS** |
| Build | **PASS** |

CI URL: https://github.com/pedroalvs/properfy/actions/runs/24820407251

---

## Staging Deploy

| Pipeline | Result | URL |
|---|---|---|
| Fly.io (backend) | **success** | https://github.com/pedroalvs/properfy/actions/runs/24820407258 |
| Cloudflare Pages (web + PWA) | **success** | https://github.com/pedroalvs/properfy/actions/runs/24820407272 |

Backend URL: `https://api-properfy.pedroalvs.com`

---

## Smoke Tests

| Endpoint | Expected | Result |
|---|---|---|
| `GET /health` | 200 `{status:"ok",db:"connected"}` | **PASS** |
| `GET /ready` | 200 `{status:"ready",checks:{db:"ready"}}` | **PASS** |
| `GET /v1/notifications/unsubscribe?token=smoke-test-tok` | 200 HTML (public, no auth) | **PASS** |
| `GET /v1/contacts` (no auth) | 401 (not 500) | **PASS** |
| `GET /v1/service-regions` (no auth) | 401 (not 500) | **PASS** |

---

## 21-Spec Validation

All 21 specs PASS. No pre-existing gaps remain.

| Spec | Status |
|---|---|
| 001 identity-access | **PASS** |
| 002 tenants-branches | **PASS** |
| 003 properties | **PASS** |
| 004 service-catalog | **PASS** |
| 005 service-groups-marketplace | **PASS** |
| 006 appointments | **PASS** |
| 007 tenant-portal | **PASS** |
| 008 inspectors-execution | **PASS** |
| 009 notifications | **PASS** |
| 010 billing-ledger | **PASS** |
| 011 reports-audit | **PASS** |
| 012 appointment-time-slot | **PASS** |
| 013 service-regions | **PASS** |
| 014 frontend-app-shell-ux | **PASS** |
| 015 permissions-rbac-matrix | **PASS** |
| 016 geospatial-map-experiences | **PASS** |
| 017 invoice-payment-reconciliation | **PASS** |
| 018 consent-notification-prefs | **PASS** — `unsubscribe-public-flow.routes.test.ts` (11 tests, T042/T043/T068) |
| 019 scheduled-reports-delivery | **PASS** |
| 020 audit-retention-pii-redaction | **PASS** |
| 021 contacts | **PASS** |

---

## Verdict

**21/21 PASS. 0 pre-existing gaps. Backend 3402/3402 green. CI green. Staging deployed.**
