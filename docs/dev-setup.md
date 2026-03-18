# Development Setup & Test Accounts

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database (Supabase recommended)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
# Copy .env.example to apps/backend/.env and fill in values
cp .env.example apps/backend/.env
# Required: DATABASE_URL, DIRECT_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY

# 3. Generate Prisma client
cd apps/backend
npx prisma generate

# 4. Run migrations
npx prisma migrate deploy

# 5. Seed the database
npx prisma db seed

# 6. Start the dev server
cd ../..
pnpm --filter backend dev
```

The API will be available at `http://localhost:3000` (default PORT).

> **Note:** If port 3000 is occupied (e.g., by VS Code Live Preview), set `PORT=4000` in your `.env` or run with `PORT=4000 pnpm --filter backend dev`.

## Health Check

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","db":"connected","timestamp":"..."}
```

## JWT Key Generation

If you need to generate new RS256 keys:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Encode for .env (replace newlines with \n):
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.pem
```

---

## Test Accounts

All accounts share the password: **`Admin@1234`**

| Role | Name | Email | Tenant | Branch |
|------|------|-------|--------|--------|
| **AM** (Admin Master) | Admin Master | `admin@pedroalvs.com` | — (platform-wide) | — |
| **OP** (Operator) | Sarah Operator | `op@pedroalvs.com` | — (cross-tenant) | — |
| **CL_ADMIN** (Client Admin) | James Chen | `cl.admin@pedroalvs.com` | Sydney Property Services | City Office |
| **CL_USER** (Client User) | Emily Park | `cl.user@pedroalvs.com` | Sydney Property Services | North Shore Office |
| **INSP** (Inspector) | Mike Inspector | `insp@pedroalvs.com` | — | — |

### Login Example

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pedroalvs.com","password":"Admin@1234"}'
```

Response includes `accessToken` and `refreshToken`. Use the access token as:

```bash
curl http://localhost:3000/v1/appointments?tenantId=10000000-0000-0000-0000-000000000001 \
  -H "Authorization: Bearer <accessToken>"
```

> **Note:** AM and OP roles require `tenantId` query parameter on tenant-scoped endpoints. CL_ADMIN/CL_USER have it injected from their JWT automatically.

---

## Seed Data Summary

### Tenant

| Field | Value |
|-------|-------|
| ID | `10000000-0000-0000-0000-000000000001` |
| Name | Sydney Property Services |
| Legal Name | Sydney Property Services Pty Ltd |
| Timezone | Australia/Sydney |
| Currency | AUD |

### Branches

| Branch | ID | Contact Email |
|--------|----|---------------|
| City Office | `20000000-0000-0000-0000-000000000001` | city@sydneypropservices.com.au |
| North Shore Office | `20000000-0000-0000-0000-000000000002` | northshore@sydneypropservices.com.au |

### Inspectors

| Name | Email | Phone | Regions |
|------|-------|-------|---------|
| Mike Inspector | insp@pedroalvs.com | +61400111222 | Sydney CBD, North Shore, Inner West |
| Lisa Wong | lisa.wong@inspectors.com.au | +61400333444 | Eastern Suburbs, South Sydney |

### Service Types

| Code | Name | Flow | Requires Tenant Confirmation |
|------|------|------|------------------------------|
| ROUTINE | Routine Inspection | ROUTINE | Yes |
| INGOING | Ingoing Inspection | INGOING | No |
| OUTGOING | Outgoing Inspection | OUTGOING | No |

### Pricing Rules (City Office)

| Service Type | Price | Payout | Payout Type |
|-------------|-------|--------|-------------|
| Routine | $150.00 | $80.00 | FIXED |
| Ingoing | $220.00 | $120.00 | FIXED |

### Properties (5 total)

| Code | Address | Type | Branch |
|------|---------|------|--------|
| SPS-001 | 12 Harbour St, Sydney 2000 | Residential | City Office |
| SPS-002 | 88 Crown St, Surry Hills 2010 | Residential | City Office |
| SPS-003 | 5 Blue St, North Sydney 2060 | Residential | North Shore |
| SPS-004 | 200 Pacific Hwy, Crows Nest 2065 | Commercial | North Shore |
| SPS-005 | 33 Glebe Point Rd, Glebe 2037 | Residential | City Office |

### Appointments (5 total, one per status)

| Status | Property | Service Type | Inspector | Tenant Contact |
|--------|----------|-------------|-----------|----------------|
| DRAFT | SPS-001 (Harbour St) | Routine | — | John Smith |
| AWAITING_INSPECTOR | SPS-002 (Crown St) | Routine | — | Maria Garcia |
| SCHEDULED | SPS-003 (Blue St) | Ingoing | Mike Inspector | David Lee |
| DONE | SPS-004 (Pacific Hwy) | Routine | Mike Inspector | Sophie Brown |
| CANCELLED | SPS-005 (Glebe Point Rd) | Outgoing | — | Alex Kim |

### Service Group

- 1 group (PUBLISHED status) with the AWAITING_INSPECTOR appointment linked

### Notification Templates

9 mandatory templates created for the tenant:
- INSPECTION_NOTICE (Email)
- REMINDER_7_DAYS, REMINDER_5_DAYS, REMINDER_3_DAYS (Email)
- PROPERTY_MANAGER_ESCALATION (Email)
- TENANT_SMS_ALERT (SMS)
- INSPECTION_CONFIRMED, INSPECTION_RESCHEDULED, INSPECTION_CANCELLED (Email)

---

## Deterministic IDs

All seed entities use deterministic UUIDs for stable cross-references:

```
Tenant:       10000000-0000-0000-0000-000000000001
Branches:     20000000-0000-0000-0000-00000000000{1,2}
Users:        00000000-0000-0000-0000-00000000000{1-5}
Inspectors:   30000000-0000-0000-0000-00000000000{1,2}
Service Types: 40000000-0000-0000-0000-00000000000{1-3}
Pricing Rules: 50000000-0000-0000-0000-00000000000{1,2}
Properties:   60000000-0000-0000-0000-00000000000{1-5}
Appointments: 70000000-0000-0000-0000-00000000000{1-5}
Service Group: 80000000-0000-0000-0000-000000000001
```

## Re-seeding

The seed script uses `upsert` operations, so it is safe to re-run:

```bash
cd apps/backend
npx prisma db seed
```
