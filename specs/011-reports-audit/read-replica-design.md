# GAP-007: Read Replica Routing — Design Document

## Current Architecture

All database queries — including heavy report data reads — hit the **primary Supabase PostgreSQL** instance. This works for current load but will become a bottleneck as:

- Report generation involves full-table scans with complex JOINs across appointments, properties, inspectors, and financial entries.
- Multiple concurrent report jobs compete with transactional writes for connection pool slots (PgBouncer).
- Dashboard aggregation queries add read pressure during peak hours.

## Proposed Architecture

### Overview

Introduce a **Supabase read replica** and a secondary Prisma client (`prismaReplica`) that is injected into read-heavy infrastructure components — primarily `PrismaReportDataReader`.

### Components

```
┌──────────────────┐     ┌──────────────────────┐
│  Fastify API     │     │  pg-boss Workers      │
│  (routes)        │     │  (report.generate)    │
└──────┬───────────┘     └──────────┬────────────┘
       │                            │
       ▼                            ▼
┌──────────────────┐     ┌──────────────────────┐
│  Use Cases       │     │  ProcessReportJob     │
│  (writes → pri)  │     │  (reads → replica)    │
└──────┬───────────┘     └──────────┬────────────┘
       │                            │
       ▼                            ▼
┌──────────────────┐     ┌──────────────────────┐
│  prisma (primary)│     │  prismaReplica        │
│  DATABASE_URL    │     │  DATABASE_REPLICA_URL │
└──────────────────┘     └──────────────────────┘
       │                            │
       ▼                            ▼
┌──────────────────┐     ┌──────────────────────┐
│  Primary PG      │◄────│  Read Replica PG      │
│  (Supabase)      │ rep │  (Supabase)           │
└──────────────────┘     └──────────────────────┘
```

### Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Primary PostgreSQL connection (existing) | Yes |
| `DATABASE_REPLICA_URL` | Read replica PostgreSQL connection | No (optional) |

### Secondary Prisma Client

```typescript
// shared/infrastructure/prisma-replica.ts
import { PrismaClient } from '@prisma/client';

let replicaClient: PrismaClient | null = null;

export function getPrismaReplica(): PrismaClient | null {
  const replicaUrl = process.env['DATABASE_REPLICA_URL'];
  if (!replicaUrl) return null;

  if (!replicaClient) {
    replicaClient = new PrismaClient({
      datasources: { db: { url: replicaUrl } },
    });
  }
  return replicaClient;
}
```

### Injection into Report Data Reader

```typescript
// In container.ts
const replicaPrisma = getPrismaReplica();
const reportDataReader = new PrismaReportDataReader(replicaPrisma ?? prisma);
```

This is the only change needed in the application layer. The `PrismaReportDataReader` already accepts a `PrismaClient` instance — no interface change required.

### Fallback Strategy

If `DATABASE_REPLICA_URL` is not set or the replica is unavailable:

1. **Not configured**: `getPrismaReplica()` returns `null`, container falls back to primary. Zero code change needed.
2. **Configured but unavailable**: Prisma will throw a connection error. The report job will fail and be retried by pg-boss with exponential backoff. If the replica remains down, the job exhausts retries and enters the DLQ.
3. **Future enhancement**: Add a health-check wrapper that detects replica failures and automatically falls back to primary within the same request. This can be implemented as a Prisma middleware or a wrapper class.

### Migration Plan

1. **Phase 1 (this document)**: Design only — no code changes.
2. **Phase 2**: Provision Supabase read replica in staging environment.
3. **Phase 3**: Add `DATABASE_REPLICA_URL` env var to staging, create `prisma-replica.ts`, inject into `PrismaReportDataReader` in `container.ts`.
4. **Phase 4**: Load test in staging — verify report generation uses replica, writes still go to primary.
5. **Phase 5**: Provision read replica in production, add env var, deploy.

### Scope of Read Replica Usage

Initially, only the following component will use the replica:

- `PrismaReportDataReader` — all report data queries (inspections, inspector performance, confirmations, financial)

Future candidates:

- `PrismaDashboardRepository` — dashboard aggregation queries
- `ListAppointmentsUseCase` — heavy list queries with complex filters (read-only)
- Audit log queries

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Replication lag causes stale data in reports | Acceptable for reports — they are inherently point-in-time snapshots. Document that reports may have up to 1 minute lag. |
| Replica connection pool exhaustion | Configure PgBouncer on replica with same pool size as primary. Limit concurrent report jobs via `MAX_CONCURRENT_REPORTS`. |
| Schema drift between primary and replica | Supabase handles schema replication automatically. Prisma client is generated from the same schema file. |
| Increased infrastructure cost | Read replica is a Supabase Pro feature. Cost is justified if report load exceeds 20% of primary capacity. |

### Monitoring

- Track query latency per data source (primary vs replica) via OpenTelemetry spans.
- Alert on replication lag exceeding 5 seconds.
- Alert on replica connection errors.

### No Code Changes in This Gap

This document is design-only. The read replica must be provisioned in Supabase infrastructure before any code changes are made. The code changes described above (Phase 3) are minimal — approximately 20 lines of new code and 2 lines changed in `container.ts`.
