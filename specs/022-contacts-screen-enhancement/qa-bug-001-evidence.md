# BUG-001 Evidence — `::uuid` cast vs `text` columns (REV 4)

This document records the QA cycle 1/2 failures and the post-fix verification
steps for BUG-001. The fix lives in
`apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts`
(three `::uuid` → `::text` replacements) and is guarded against regression by:

- `apps/backend/tests/unit/contact/prisma-contact.repository.bug-001.test.ts`
  — fail-fast unit test that scans the source for any leftover `::uuid` cast
  in the three aggregation methods (no Docker required).
- `apps/backend/tests/integration/db/contact-aggregation-types.integration.test.ts`
  — Testcontainers test that asserts (a) the migrated schema stores
  `contacts.id` and `appointment_contacts.contact_id` as Postgres `text`
  (`information_schema.columns.data_type = 'text'`) and (b) all three
  aggregations round-trip end-to-end against real Postgres.

## How to capture before/after curl evidence

The bug only reproduces against a running API connected to staging Supabase
(or any Postgres where the schema columns are `text`, matching the migrated
schema). Local Testcontainers historically tolerated the `::uuid` cast.

### Before-fix repro (cycle 1/2 baseline)

Against the cycle 1/2 build (commit `903d264`, pre-REV 4):

```sh
# CL_ADMIN token for a tenant with at least 1 active contact + 1 appointment.
TOKEN="$(curl -sX POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"cl-admin@tenant.com","password":"…"}' | jq -r .accessToken)"

# 1. Listing — fails with 500 INTERNAL_ERROR
curl -isX GET "$API/v1/contacts" -H "Authorization: Bearer $TOKEN" | head -1
# HTTP/1.1 500 Internal Server Error

# 2. Detail with includeProperties=true — also fails
curl -isX GET "$API/v1/contacts/$CONTACT_ID?includeProperties=true" \
  -H "Authorization: Bearer $TOKEN" | head -1
# HTTP/1.1 500 Internal Server Error
```

Server log (cycle 1/2):

```
PrismaClientKnownRequestError: invalid input syntax for type uuid: "<text-id>"
  at countDistinctPropertiesByContactIds (prisma-contact.repository.ts:304)
```

### After-fix expectation (REV 4)

Against the REV 4 build (this branch, with `::text` casts):

```sh
curl -isX GET "$API/v1/contacts" -H "Authorization: Bearer $TOKEN" | head -1
# HTTP/1.1 200 OK
# Body includes the new `propertyCount: <int>` field per item.

curl -isX GET "$API/v1/contacts/$CONTACT_ID?includeProperties=true&propertiesPageSize=5" \
  -H "Authorization: Bearer $TOKEN" | head -1
# HTTP/1.1 200 OK
# Body includes `properties: { data: [...], pagination: {...} }`.
```

The Guia / QA should pin the actual after-fix curl output (with real ids
redacted to UUID-format placeholders) into the PR description before merge.

## Why the unit guard exists

The cycle 1/2 regression slipped through 153/153 green local tests because
the local Postgres image was lenient about the `::uuid` cast on a `text`
column. The new unit guard reads the repository source and asserts the
absence of `::uuid` in the three aggregation methods — it executes in the
default test suite and does not depend on Docker, so a future
"fix-it-locally-and-ship" regression cannot pass green again.
