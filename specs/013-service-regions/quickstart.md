# Quickstart: Service Regions

**Feature**: `013-service-regions`
**Status**: IMPLEMENTED (Phase 1, with critical divergence pending correction)

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+ with **PostGIS extension** (Supabase includes it by default)
- Environment variables configured (see backend `.env`)

## Setup

```bash
# Install dependencies
pnpm install

# Run Prisma migrations (includes PostGIS-dependent columns)
pnpm --filter backend prisma migrate deploy

# Start the backend
pnpm --filter backend dev
```

## Key Endpoints

| Method | Path | Description | Roles |
|---|---|---|---|
| POST | `/v1/service-regions` | Create region | AM, OP |
| GET | `/v1/service-regions` | List regions (tenant-scoped) | All authenticated |
| GET | `/v1/service-regions/:id` | Get region detail | All authenticated |
| PATCH | `/v1/service-regions/:id` | Update region | AM, OP |
| POST | `/v1/service-regions/:id/deactivate` | Deactivate with reason | AM, OP |
| DELETE | `/v1/service-regions/:id` | Hard delete (inactive only) | AM, OP |
| POST | `/v1/service-regions/resolve` | Resolve regions for appointments | AM, OP |

## Creating a Region

```bash
curl -X POST http://localhost:3000/v1/service-regions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "<uuid>",
    "name": "Sydney CBD",
    "geojson": {
      "type": "Polygon",
      "coordinates": [[[151.20, -33.87], [151.22, -33.87], [151.22, -33.85], [151.20, -33.85], [151.20, -33.87]]]
    },
    "color": "#3b82f6"
  }'
```

## Resolving Regions for Appointments

```bash
curl -X POST http://localhost:3000/v1/service-regions/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentIds": ["<uuid1>", "<uuid2>", "<uuid3>"]
  }'
```

Returns which regions contain each appointment's property, inspector counts per region, and unmatched appointments.

## Running Tests

```bash
# Unit tests (when created)
pnpm --filter backend test -- --run tests/unit/service-region

# Integration tests (require PostgreSQL + PostGIS)
pnpm --filter backend test -- --run tests/integration/service-region

# With coverage
pnpm --filter backend test -- --coverage
```

## Architecture Overview

```
Request -> auth-middleware (JWT verify, AuthContext) -> Route -> Use Case -> Repository -> Prisma/Raw SQL -> PostgreSQL + PostGIS
                                                                  |
                                                            AuditService (side effect)
```

- **Domain**: `ServiceRegionEntity`, `ServiceRegionRepository` (port), error codes
- **Application**: 7 use cases (create, update, deactivate, delete, get, list, resolve)
- **Infrastructure**: Prisma repository with raw SQL for PostGIS operations (`ST_GeomFromGeoJSON`, `ST_Contains`)
- **Interfaces**: Fastify routes with Zod schema validation

## Key Concepts

- **Tenant scoping**: Every region belongs to one tenant. AM can access any tenant; all others see only their own.
- **Dual storage**: `geojson` (jsonb) is the frontend source of truth; `geom` (PostGIS Geometry) is used by spatial queries. Both updated atomically on write.
- **Inspector assignment**: Many-to-many via `inspector_regions` join table. Full-replacement semantics on set.
- **Region resolution**: Uses `ST_Contains(region.geom, property.coordinates)` to match appointment properties to regions. Boundary-inclusive.
- **Deactivation vs deletion**: Deactivation hides from marketplace; deletion permanently removes (only when inactive and unreferenced).
