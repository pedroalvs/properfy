# Pricing Rule Endpoints

**Feature**: `004-service-catalog`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/pricing-rule/interfaces/pricing-rule.routes.ts`, `packages/shared/src/schemas/pricing-rule.ts`

Pricing rules are **tenant-scoped**. Exactly one active rule is allowed per `(tenant_id, service_type_id, branch_id)` triple, where `branch_id = NULL` is the tenant-wide fallback.

---

## POST `/v1/pricing-rules`

Create a new pricing rule.

- **Auth**: required
- **Allowed roles**: `AM` (must supply `tenantId`); `OP` (own tenant, from JWT); `CL_ADMIN` (own tenant, from JWT)
- **Audit**: yes (`pricing_rule.created`)

**Request body** (`createPricingRuleSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantId` | uuid | conditional | Required for AM. Ignored for OP and CL_ADMIN (tenant derived from JWT). |
| `serviceTypeId` | uuid | yes | Must exist in the service type catalog. |
| `branchId` | uuid | no | Must belong to the resolved tenant. Omit for the tenant-wide fallback. |
| `priceAmount` | number > 0, multiples of 0.01 | yes | Charged to the tenant in the tenant's currency. |
| `payoutType` | `FIXED\|PERCENTAGE` | yes | |
| `payoutValue` | number > 0, multiples of 0.01 | yes | Flat amount if `FIXED`; percent if `PERCENTAGE`. |
| `bonusRuleJson` | object | no | Opaque; owned by feature 010. |
| `status` | `ACTIVE\|INACTIVE` | no | Default `ACTIVE`. |

**Response 201**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "currency": "AUD",
    "serviceTypeId": "<uuid>",
    "branchId": "<uuid|null>",
    "priceAmount": 250.00,
    "payoutType": "FIXED",
    "payoutValue": 150.00,
    "bonusRuleJson": null,
    "status": "ACTIVE",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

> `currency` is read from `Tenant.currency` at response time (feature 002). It is not a stored field on the rule — see GAP-002.

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`, `TENANT_NOT_FOUND`, `SERVICE_TYPE_NOT_FOUND`, `BRANCH_NOT_FOUND`, `PRICING_RULE_DUPLICATE`.

---

## GET `/v1/pricing-rules`

List pricing rules with pagination and filters.

- **Auth**: required
- **Allowed roles**: AM (any tenant via `tenantId` filter); OP, CL_ADMIN, CL_USER (locked to own tenant)

**Query params** (`listPricingRulesQuerySchema`)

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1..100 | 20 | |
| `tenantId` | uuid | — | AM only. Ignored for OP and CL roles. |
| `serviceTypeId` | uuid | — | |
| `branchId` | uuid | — | |
| `status` | `ACTIVE\|INACTIVE` | — | |
| `sortBy` | string | `createdAt` | |
| `sortOrder` | `asc|desc` | `desc` | |

**Response 200**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid>",
      "currency": "AUD",
      "serviceTypeId": "<uuid>",
      "branchId": "<uuid|null>",
      "priceAmount": 250.00,
      "payoutType": "FIXED",
      "payoutValue": 150.00,
      "bonusRuleJson": null,
      "status": "ACTIVE",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 4
}
```

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR`.

---

## PATCH `/v1/pricing-rules/:pricingRuleId`

Update a pricing rule. Cannot change `tenantId`, `serviceTypeId`, or `branchId` — those are part of the uniqueness key. To move a rule to a different scope, create a new rule and deactivate the old one.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP` (own tenant only); `CL_ADMIN` (own tenant only)
- **Audit**: yes (`pricing_rule.updated`)

**Request body** (`updatePricingRuleSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `priceAmount` | number > 0, multiples of 0.01 | |
| `payoutType` | `FIXED\|PERCENTAGE` | |
| `payoutValue` | number > 0, multiples of 0.01 | |
| `bonusRuleJson` | object \| null | Replaces existing value wholesale. |
| `status` | `ACTIVE\|INACTIVE` | Use `INACTIVE` to retire a rule. No hard-delete path. |

**Response 200**: same shape as create.

**Error codes**: `AUTH_FORBIDDEN`, `PRICING_RULE_NOT_FOUND`, `VALIDATION_ERROR`.
