# Cross-Feature Correction: ServiceRegion Must Be Per-Tenant

**Created**: 2026-04-06
**Status**: OPEN — decision confirmed: adhere to dossier (per-tenant)
**Origin**: Validation of feature 004 against business dossier via guia-properfy

## Finding

The business dossier specifies `ServiceRegion` as a **per-tenant** entity (each agency defines its own geographic coverage areas). The current implementation treats `ServiceRegion` as a **global** entity with no `tenant_id`.

## guia-properfy ruling

> "No dossiê: ServiceRegion é per-tenant. No código atual: ServiceRegion global. A hipótese 'região global' não está no dossiê. Isso deve ser tratado como divergência real."

## Current implementation

- `service_regions` table has NO `tenant_id` column
- AM/OP create regions globally
- `InspectorRegion(inspector_id, region_id)` maps inspectors to regions without tenant scope
- Marketplace resolve endpoint matches appointments to regions via GeoJSON without tenant filtering
- Service groups reference `service_region_id` directly

## Per-dossier model

- Each tenant defines its own service regions
- Region names can repeat across tenants
- Marketplace matching is scoped by the tenant of the appointment/property
- Inspectors serving 3 tenants would have separate region mappings per tenant (same geometry, different region rows)
- `service_regions.tenant_id → tenants.id` is required

## Affected features

- **Feature 004-service-catalog**: add `tenant_id` to `service_regions`, scope CRUD by tenant, adjust RBAC (OP manages own tenant's regions)
- **Feature 005-service-groups-marketplace**: marketplace resolve scoped by tenant, publish requires region of the same tenant
- **Feature 008-inspectors-execution**: InspectorRegion changes shape — mappings become per-tenant

## Trade-offs

- **Dossier-adherent**: each tenant controls their coverage independently. Clear data isolation.
- **Global (current)**: simpler model. One region definition serves all tenants. Inspectors don't need duplicated region mappings. Operational team manages fewer entities.

## Decision (2026-04-06)

**Adhere to the dossier: ServiceRegion is per-tenant.** Not accepted as global evolution.

Canonical rules:
- Every `ServiceRegion` belongs to exactly one tenant (`tenant_id` mandatory)
- Region names may repeat across different tenants
- Uniqueness applies only within the same tenant
- Region-based eligibility must always be resolved inside tenant scope
- Inspector may be global/multi-tenant, but region ownership remains tenant-scoped

This is a significant migration affecting schema, marketplace logic, and inspector region mappings.
