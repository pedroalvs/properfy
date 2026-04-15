# Implementation Plan: Notifications

**Branch**: `009-notifications` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Feature Status**: IMPLEMENTED (Phase 1) — Phase 2/3 gaps tracked in [tasks.md](./tasks.md).

## Summary

Own the platform's outbound communication: tenant portal links, inspection reminders, escalations, transition-driven confirmations across email, SMS, and WhatsApp. Every outbound message is persisted, retried with exponential backoff, and updated by provider webhooks. Templates are tenant-overridable on top of a platform default.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.

**Primary Dependencies**

- Backend: Fastify, Prisma, Zod, pg-boss (send job + scheduled dispatchers + poll-retryable sweep), shared `AuditService`.
- Providers (production target): Resend (EMAIL), Mobile Message (SMS), Zenvia (WhatsApp). Current code still uses Twilio for SMS until the provider migration lands.
- Providers (tests): `StubEmailProvider`, `StubSmsProvider`, `StubWhatsAppProvider`.
- Cross-module ports: `IAppointmentRepository` (reminder + escalation dispatchers), `CreateNotificationUseCase` is the canonical internal entry point called by features 006, 007, 008.

**Storage**

- PostgreSQL (Supabase). Tables: `notifications`, `notification_templates`, plus writes into `audit_logs` only for template upserts (notifications themselves are not audit-written — they ARE audit-like records).

**Testing**

- Unit: Vitest — every use case including retry math (delays + jitter bounds), template renderer, webhook event mapping.
- Integration: Supertest + real Postgres — full send flow with stub providers, webhook endpoints, list/retry endpoints, dispatchers.
- Provider adapter tests: narrow unit tests that mock the provider HTTP client.

**Target Platform**: Backend on Fly.io. No frontend — operator UI lives in the appointment/tenant detail pages.
**Project Type**: Monorepo — backend-only module.
**Performance Goals**: Create p95 < 100 ms. Send worker p95 < 2 s (provider round-trip dominant). Webhook response < 500 ms.
**Constraints**: Retry budget is 6 attempts over ~25 minutes. Recipient PII never in production logs. Webhook endpoints always return 200 to avoid provider retry storms.
**Scale/Scope**: Phase 1 target: tens of thousands of notifications/day steady state, spikes around reminder-dispatch cron runs.

## Layer Separation: Business Rules vs. Infrastructure

This feature mixes three layers that readers must distinguish:

- **Business rules** (`Source: dossier`): the 9 mandatory events, their channels, tenant-configurable templates, delivery status tracking, retry with backoff. These are dossiê-mandated and cannot be changed without a product decision.
- **Infrastructure/operational choices** (`implementation decision`): provider selection (Resend/Mobile Message/Zenvia), webhook endpoint shapes, retry delay values (15s/45s/2min/5min/15min), jitter factor (10%), pg-boss job config. These can be changed operationally without a dossiê amendment. SMS currently diverges in code (Twilio) and should migrate to Mobile Message.
- **Deployment baseline** (`implementation decision`): the 10th template (`INSPECTION_UNAVAILABILITY_REPORTED`), the `TemplateRendererService` {{variable}} engine, the fire-and-forget handler pattern. Operationally important but not dossiê-mandated as canonical.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | Module layered as `domain/`, `application/`, `infrastructure/`, `interfaces/`. Provider adapters are in `infrastructure/` implementing ports in `domain/providers.ts`. `TemplateRendererService` is a pure domain helper. |
| II. Multi-Tenant Safety | PASS | Every `Notification` row carries `tenant_id`. Template lookup falls back to platform default via `tenant_id IS NULL`. Reads in the operator UI are scoped by tenant for CL roles. |
| III. Test-Driven Development | PARTIAL | Unit coverage present for retry math, rendering, and every use case. Webhook handlers have integration coverage. Phase 2/3 items must land with TDD. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/notification.ts` are authoritative. Human projection in [contracts/](./contracts/). |
| V. Simplicity & Minimal Impact | PASS | Template renderer is deliberately simple — GAP-005 tracks a more capable engine if needed. Providers have real + stub pairs only because tests must be deterministic. |

**Gate result**: PASS for Phase 1 as implemented.

## Project Structure

### Documentation (this feature)

```text
specs/009-notifications/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   ├── README.md
│   ├── notification-endpoints.md
│   └── webhook-endpoints.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/backend/src/modules/notification/
├── domain/
│   ├── notification.entity.ts
│   ├── notification.repository.ts               # port
│   ├── notification-template.entity.ts
│   ├── notification-template.repository.ts      # port
│   ├── notification.errors.ts
│   ├── notification.constants.ts                # MANDATORY_TEMPLATE_CODES, RETRY_DELAYS, MAX_RETRY_COUNT
│   ├── providers.ts                             # IEmailProvider, ISmsProvider, IWhatsAppProvider
│   └── template-renderer.service.ts             # pure
├── application/
│   ├── use-cases/
│   │   ├── create-notification.use-case.ts       # internal caller entry point
│   │   ├── send-notification.use-case.ts         # worker entry point
│   │   ├── retry-notification.use-case.ts        # manual retry (operator)
│   │   ├── poll-retryable-notifications.use-case.ts  # scheduled sweep
│   │   ├── dispatch-reminders.use-case.ts        # 7/5/3 day reminders
│   │   ├── dispatch-escalations.use-case.ts      # property manager escalation
│   │   ├── handle-provider-webhook.use-case.ts   # provider → internal event
│   │   ├── list-notifications.use-case.ts
│   │   ├── get-notification.use-case.ts
│   │   ├── list-notification-templates.use-case.ts
│   │   └── upsert-notification-template.use-case.ts
│   └── handlers/
│       ├── notify-on-status-transition.handler.ts    # consumes feature 006
│       └── notify-on-tenant-portal-action.handler.ts # consumes feature 007
├── infrastructure/
│   ├── prisma-notification.repository.ts
│   ├── prisma-notification-template.repository.ts
│   ├── resend-email.provider.ts
│   ├── twilio-sms.provider.ts              # current code path; target provider is Mobile Message after migration
│   ├── zenvia-whatsapp.provider.ts
│   ├── stub-email.provider.ts
│   ├── stub-sms.provider.ts
│   └── stub-whatsapp.provider.ts
└── interfaces/
    └── notification.routes.ts                    # list, detail, retry, templates, webhooks

packages/shared/src/schemas/notification.ts

apps/backend/tests/
├── unit/notification/
└── integration/notification/
```

**Structure Decision**: Single Clean-Architecture module. Provider adapters follow the ports-and-adapters pattern strictly so the test suite can run end-to-end without network access. Handlers (`application/handlers/`) are the glue between inbound domain events from features 006/007 and the `CreateNotificationUseCase`.

## Cross-Feature Dependencies

- **Feature 002-tenants-branches** — Reads tenant active-status (via auth middleware). Tenant-specific templates live in this feature but are owned (logically) by the tenant's settings.
- **Feature 004-service-catalog** — Not a direct dependency, but reminder payloads include service type info.
- **Feature 006-appointments** — Biggest producer of notifications. `onTransitionHandler` is wired to `notify-on-status-transition.handler.ts`. Every status transition potentially triggers a template send.
- **Feature 007-tenant-portal** — Portal actions (confirm, reschedule, unavailable) fan out notifications via `notify-on-tenant-portal-action.handler.ts`. Token generation calls `CreateNotificationUseCase` directly for the `TENANT_PORTAL_LINK` template.
- **Feature 008-inspectors-execution** — Not a direct producer today. Execution transitions flow through feature 006's state machine, which fires the notification handler.
- **Feature 011-reports-audit** — Template upserts are audited. Notification rows themselves are not in `audit_logs`; they serve as their own audit trail.

## Security & Operational Notes

- **Webhook endpoints are unauthenticated**: providers cannot carry JWTs. Each provider supports a signature or authenticated callback mechanism (Resend via Svix; Mobile Message to be confirmed in implementation; Zenvia HMAC). Signature validation is GAP-007.
- **Provider secrets via environment**: API keys for Resend, Mobile Message, Zenvia are injected at runtime. Stub providers are wired in test container only. Current code still uses Twilio env vars for SMS until migration.
- **Recipient PII in logs**: NFR-005 forbids logging email/phone at production log levels. Send adapter error handlers must redact.
- **Retry budget is bounded**: 6 attempts across ~25 minutes (`15s + 45s + 2min + 5min + 15min + one more`). Terminal failure is `FAILED`. No DLQ beyond this.
- **Idempotency on reminders**: guaranteed by `existsByAppointmentAndTemplate` check inside `DispatchRemindersUseCase` — a re-run within the same day will not duplicate.
- **Fire-and-forget handlers**: appointment and portal flows call handlers with try/catch at the caller boundary. Handler failures are swallowed. Alerting on handler errors is GAP-008.
- **Webhook always-200**: prevents provider retry storms, even on unknown message ids. Unknown events are logged internally for debugging.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Retry math in application code (not in pg-boss) | pg-boss retries with fixed delays; the business rule requires specific delays and jitter per attempt. | pg-boss `retryLimit` + `retryBackoff` cannot express the exact sequence without drift. |
| Separate `notification.send` job + `poll-retryable` sweep | Splitting allows the sweep to run cheaply on a schedule while sends are fast-path queued on creation. | Relying on pg-boss retry exclusively would lose the scheduled backoff and complicate observability. |
| Provider adapters with stub twins | Tests must not make network calls. Stub twins mirror the real interface shape. | Inline mocks per test case drift from the real interface. |
| Handlers wired by constructor injection into features 006 / 007 | Avoids a hard import from those features to this one; fire-and-forget is acceptable because failures do not affect business outcomes. | A domain event bus would be cleaner but is not yet introduced — tracked as 002#GAP-005. |
| Multiple webhook endpoints (one per provider) | Each provider has a distinct payload shape and signature scheme; a single generic endpoint would over-index on provider concepts. | Generic endpoint with provider dispatch logic inside would require per-provider branches anyway. |
| Per-channel hardcoded provider selection | One-provider-per-channel is sufficient for Phase 1 and avoids the complexity of failover routing. | Runtime provider selection needs capacity, pricing, and quality signals not yet in the platform. |

Phase 1 deviations above are justified. Phase 2 items adding new abstractions must add rows here.

## Execution Strategy

### Phase 2 — Gap Closure

#### Wave 1: Security + Quick Fixes (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 1a | GAP-007 — Webhook signature validation | T170–T174 | HIGH security. Unauthenticated webhooks. |
| 1b | GAP-006 — Poll-retryable batch cap | T160–T161 | Tiny fix. LIMIT on query. |
| 1c | GAP-008 — Handler exception alerting | T180–T183 | Observability. |
| 1d | CORRECTION — OP template restriction | T205–T206 | Tenant-scope fix. |

#### Wave 2: Compliance + Safety (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 2a | GAP-001 — Unsubscribe/opt-out | T110–T115 | HIGH legal compliance. |
| 2b | GAP-003 — Per-tenant budget | T130–T133 | HIGH production safety. |
| 2c | GAP-004 — Variables validation | T140–T143 | Quality enforcement. |

#### Wave 3: Enhancement (parallel)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 3a | GAP-002 — WhatsApp approval tracking | T120–T122 | Provider compliance. |
| 3b | GAP-009 — Per-attempt audit trail | T190–T192 | Observability. |
| 3c | GAP-010 — SMS fallback | T200–T202 | UX improvement. |

#### Wave 4: Templating (serial)

| Order | Gap | Tasks | Rationale |
|-------|-----|-------|-----------|
| 4 | GAP-005 — Proper templating engine | T150–T153 | Largest refactor. |

```
Wave 1:  GAP-007 ══╗
         GAP-006 ══╬══ (parallel)
         GAP-008 ══╝
         CORRECTION ╝

Wave 2:  GAP-001 ══╗
         GAP-003 ══╬══ (parallel)
         GAP-004 ══╝

Wave 3:  GAP-002 ══╗
         GAP-009 ══╬══ (parallel)
         GAP-010 ══╝

Wave 4:  GAP-005 (serial)
```
