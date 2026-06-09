# Properfy – Project-level guidance for Claude Code

This file gives you (Claude Code) high-level guidance about the Properfy system when working from the repository root.

The repository is a **monorepo** composed of:

- `apps/backend/` – Node.js API (Fastify + Clean Architecture + Prisma + pg-boss)
- `apps/web/` – React + TypeScript + Vite + Tailwind CSS SPA (Portal Master Admin, Portal Imobiliaria, Portal Inquilino)
- `apps/pwa/` – React + Vite + Tailwind CSS PWA (Inspector Mobile App)
- `packages/shared/` – Shared schemas, types, enums and contracts (Zod + TypeScript)

When implementing or modifying features, you must respect the **business rules**, **multi-tenant model**, **state machine** and **API contracts** defined here. Workspace-specific details belong in `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/pwa/CLAUDE.md` and `packages/shared/CLAUDE.md`.

---

## 1. Project overview

**Name:** Properfy
**Type:** Multi-tenant B2B SaaS
**Domain:** Property inspection services

**Main goals:**

- Orchestrate the complete lifecycle of property inspection appointments with traceability, financial control and multi-tenant isolation.
- Connect real estate agencies (clients), operational team (admin/master admin), inspectors (contractors) and tenants (access via unique link).

**Portals:**

1. **Portal Master Admin** (Web) – Platform-wide management
2. **Portal Imobiliaria/Cliente** (Web) – Agency/client operations
3. **Portal Inquilino** (Web, via unique link) – Tenant confirmation/rescheduling
4. **App Inspetor** (PWA Mobile) – Inspector field operations

---

## 2. High-level architecture

**Backend (API):**

- Node.js + Fastify
- Clean Architecture (modules: `domain/`, `application/`, `infrastructure/`, `interfaces/`)
- Prisma ORM + PostgreSQL (Supabase as infrastructure)
- pg-boss for async jobs (notifications, imports, finance) — PostgreSQL-backed, no Redis
- Internal JWT authentication (RS256 with `kid` rotation)
- Stateless application

**Frontend (Web + PWA):**

- React + Vite + Tailwind CSS
- OpenAPI-generated client as source of truth for API contracts
- Design system evolved from legacy Vue 2 + Vuetify 2 app (preserve visual identity)

**Infrastructure:**

- `dev` – local
- `staging` – VPS with Portainer
- `prod` – Fly.io with rolling deploy + health check
- Supabase Storage (S3-compatible) for files
- PgBouncer for connection pooling

**Monorepo tooling:**

- Package manager: `pnpm`
- Workspace structure: `apps/backend`, `apps/web`, `apps/pwa`, `packages/shared`

---

## 3. Development commands

```bash
# Install all dependencies
pnpm install

# Run backend
pnpm --filter backend dev

# Run web frontend
pnpm --filter web dev

# Run PWA
pnpm --filter pwa dev

# Run all tests
pnpm test

# Lint all
pnpm lint

# Typecheck all
pnpm typecheck
```

---

## 4. Domain modules

The backend is organized by domain modules:

1. **Identity & Access** – auth, users, roles, sessions, 2FA
2. **Tenants / Imobiliarias / Branches** – agency management with branches
3. **Properties** – property CRUD with geocoding
4. **Appointments** – core entity, state machine driven
5. **Service Groups / Marketplace** – geographic grouping, offer/accept flow
6. **Tenant Confirmation** – portal via unique link (SMS/email)
7. **Inspector Execution** – start/done with geolocation
8. **Notifications** – email/SMS with templates, retry, DLQ
9. **Billing / Ledger** – financial entries, inspector invoices, adjustments
10. **Reports / Export / Audit** – XLSX reports, audit trail

---

## 5. Appointment state machine

Official statuses:

1. `DRAFT` – Created, not yet released
2. `AWAITING_INSPECTOR` – Available for inspector acceptance (alias: `OPEN`)
3. `SCHEDULED` – Accepted by inspector, programmed for execution
4. `DONE` – Inspection executed and finalized
5. `CANCELLED` – Cancelled (reason required)
6. `REJECTED` – Invalid or impossible to execute (reason required)

**Key transitions:**

| From | To | Actor | Reason required |
|---|---|---|---|
| `DRAFT` | `AWAITING_INSPECTOR` | OP, SYS | No |
| `DRAFT` | `REJECTED` | OP, AM | Yes |
| `DRAFT` | `CANCELLED` | OP, CL, AM | Yes |
| `AWAITING_INSPECTOR` | `SCHEDULED` | SYS, OP | No |
| `AWAITING_INSPECTOR` | `CANCELLED` | OP, CL, AM | Yes |
| `SCHEDULED` | `DONE` | INSP, OP | No |
| `SCHEDULED` | `CANCELLED` | OP, CL, AM | Yes |
| `SCHEDULED` | `REJECTED` | OP, SYS | Yes |
| `REJECTED` | `DRAFT` | OP, AM | Yes |
| `REJECTED` | `AWAITING_INSPECTOR` | OP, AM | Yes | System-triggered when appointment is added to a service group |
| `CANCELLED` | `DRAFT` | OP, AM | Yes |
| `DONE` | `DRAFT` | AM only | Yes |

**Rules:**

- Every transition must register an audit log.
- Sensitive transitions require a reason.
- Every transition must validate tenant scope and actor permissions.

---

## 6. User roles (RBAC)

| Code | Role | Scope |
|---|---|---|
| `AM` | Admin Master | Platform-wide, all tenants |
| `OP` | Operator | Operational team, cross-tenant |
| `CL_ADMIN` | Client Admin | Agency admin, own tenant |
| `CL_USER` | Client User | Agency user, own tenant (configurable permissions) |
| `INSP` | Inspector | Own schedule and assignments |
| `TNT` | Tenant (Inquilino) | Portal access via unique link |

**Critical actions requiring elevated permissions (AM or OP only):**

- Reopen `DONE` appointment
- Manual financial status changes and refunds
- Force manual confirmation without tenant response
- Mark `SCHEDULED -> REJECTED`
- Disable client/branch/inspector with open appointments
- Change pricing or split on operational client

---

## 7. Multi-tenant rules

1. `tenant_id` is mandatory on all business entities.
2. JWT includes `tenant_id` and `role` claims.
3. Middleware extracts auth context per request.
4. Authorization is centralized in the application layer (RBAC/ABAC).
5. Repositories are always scoped by tenant.
6. Audit for critical operations (status, financial, permissions).
7. Idempotency on critical commands (acceptance, execution, notifications, financial entries).
8. No business query without tenant scope.

---

## 8. Financial rules

1. **Tenant debit** and **inspector payout** happen when appointment reaches `DONE`.
2. Both require cross-check by operator (`done_checked_by_user_id`).
3. Split can vary by service type.
4. Cancellation has no cost.
5. Refund only when service was marked as done but not actually executed.
6. Manual adjustments allowed for AM and OP.
7. Closing/invoicing period: weekly, biweekly or monthly (configurable per client/inspector).

---

## 9. API conventions

- Style: REST
- Prefix: `/v1`
- Success: direct response; paginated lists with `page`, `pageSize`, `sortBy`, `sortOrder`
- Error envelope: `{ error: { code, message, details } }`
- Naming: `camelCase` in application, `snake_case` in database
- Idempotency: `Idempotency-Key` header for critical operations
- `request_id` mandatory on all API requests and jobs

---

## 10. Notification rules

Mandatory notification events:

1. Initial inspection notice (Email)
2. Reminders at 7, 5, 3 days (Email)
3. Escalation to Property Manager (Email)
4. SMS alert to tenant (SMS)
5. Confirmation, rescheduling, cancellation (Email)

Templates are configurable per agency (logo, custom text, signature, dynamic variables).

---

## 11. Testing strategy

- **TDD mandatory per PR** (red-green-refactor)
- Unit tests: `Vitest`
- API integration: `Supertest`
- Frontend E2E: `Playwright`
- Coverage: `70%` global minimum, `80%+` for critical modules (auth, appointments, finance)
- CI gate: lint + typecheck + tests + Prisma migration validation + build

---

## 12. CI/CD pipeline

1. **PR to `main`:** lint → typecheck → tests → Prisma migration dry-run → build (all green to merge)
2. **After merge:** deploy to `staging` (VPS/Portainer) → smoke test → deploy to `prod` (Fly.io)
3. Migrations: always in `staging` first, then `prod`. Pattern: expand/contract.
4. Rollback: automatic by health check in prod; manual by release/tag.
5. Deploy window: from 09:00 Brazil (23:00 Sydney reference).
6. Secrets: injected by provider (no `.env` in staging/prod).

---

## 13. Conventions for Claude Code

When you (Claude Code) implement or modify code in this project:

1. **Read the relevant workspace CLAUDE.md** before touching workspace code.
2. **Respect the state machine** – transitions, actors and side effects are formally defined.
3. **Maintain multi-tenant safety** – always include `tenant_id` in queries and validate scope.
4. **Follow Clean Architecture** – domain has no dependencies; application orchestrates; infrastructure implements ports.
5. **Use `packages/shared`** for any type, enum or schema shared between workspaces.
6. **Follow Conventional Commits** for commit messages. Never include Claude or AI references in commit messages or trailers.
7. **Validate with Zod** – all API payloads must be validated.
8. **Never skip tests** – TDD is mandatory.
9. **Consult `projeto-consolidado/`** for complete domain documentation when needed.

---

## 14. Key documentation references

| Document | Purpose |
|---|---|
| `projeto-consolidado/escopo-v2.md` | Full product scope |
| `projeto-consolidado/modelo-dados-executavel.md` | Data model (entities, fields, relationships) |
| `projeto-consolidado/state-machine-executavel.md` | State machine (transitions, actors, side effects) |
| `projeto-consolidado/api-contratos-principais.md` | API contracts |
| `projeto-consolidado/regras-negocio-respostas-cliente.md` | Business rules (financial, rescheduling, RBAC, notifications) |
| `projeto-consolidado/infra-tecnologia-production-ready.md` | Infrastructure and production readiness |
| `projeto-consolidado/checklist-geracao-codigo-ia.md` | Code generation decisions |
| `projeto-consolidado/decisoes-internas-pendentes.md` | All internal technical decisions (all DEFINIDO) |
| `projeto-consolidado/instrucoes-cicd-fly-portainer.md` | CI/CD instructions |
| `projeto-consolidado/frontend-system-spec.md` | Frontend visual spec |
| `projeto-consolidado/ui-system-atual.md` | Legacy UI system reference |

---

## 15. External dependencies

1. SMS: MobileMessage (mobilemessage.com.au)
2. Transactional email: Resend
3. Maps and geocoding: Mapbox
4. Database and storage: Supabase (PostgreSQL + S3-compatible storage)

---

## 16. Workflow orchestration

### Plan mode

- Enter plan mode before any non-trivial task to discuss approach, constraints and risks.
- Draft a step-by-step plan and wait for approval before writing code.
- Update the plan whenever the approach changes mid-task.

### Subagents

- Use subagents to parallelize independent work (research, implementation, testing).
- Each subagent must have a clear, scoped task description with all necessary context.
- Prefer foreground agents when their output is needed before the next step; use background agents for truly independent work.

### Self-improvement

- After completing a task, reflect on what went well and what could improve.
- If you discover a recurring pattern or convention not yet documented, propose adding it to the relevant CLAUDE.md.
- Capture reusable lessons in memory so future conversations benefit.

### Verification

- Never claim work is complete without running verification commands (build, lint, typecheck, tests).
- Show evidence of passing verification before marking a task as done.
- If verification fails, fix the issue and re-verify — do not skip or defer.

### Elegance

- Prefer the simplest solution that fully meets requirements.
- Avoid over-engineering, unnecessary abstractions and speculative generality.
- Code should read naturally — clear names, minimal nesting, obvious flow.

### Autonomous bug fixing

- When a build, lint or test failure occurs during your work, fix it immediately.
- Do not ask for permission to fix errors you introduced — just fix them and re-verify.
- If the fix is non-trivial or touches unrelated code, explain what happened and why.

---

## 17. Task management

### Plan first

- Break complex tasks into discrete, verifiable steps before starting.
- Use the task system to track progress within the current conversation.
- Each step should have clear completion criteria.

### Verify at every step

- Run relevant checks (typecheck, lint, tests) after each meaningful change.
- Do not batch multiple changes and verify only at the end.
- If a step fails verification, fix it before moving to the next step.

### Track progress

- Update task status as you complete each step.
- If you deviate from the plan, update the plan and explain why.
- Surface blockers early — do not silently skip steps.

### Explain decisions

- When making a non-obvious choice, state the alternatives you considered and why you chose this one.
- Keep explanations concise — one or two sentences, not paragraphs.

### Document as you go

- Add inline comments only where the logic is not self-evident.
- Update relevant documentation if your change affects public APIs or conventions.
- Do not add documentation for documentation's sake.

### Capture lessons

- If you discover something surprising about the codebase, save it to memory.
- If a debugging session reveals a non-obvious cause, note the pattern for future reference.
- Lessons should be specific and actionable, not generic advice.

---

## 18. Core principles

### Simplicity

- The best code is the least code that solves the problem correctly.
- Prefer standard library and framework features over custom implementations.
- Delete dead code — do not comment it out or hide it behind flags.

### No laziness

- Never use placeholder comments like `// TODO: implement`, `// rest of code here` or `// ...`.
- Never truncate output or skip sections — complete every implementation fully.
- If a task is too large for one pass, say so and propose how to split it — do not silently cut corners.

### Minimal impact

- Change only what is necessary to achieve the goal.
- Do not refactor, reformat or reorganize code that is not directly related to the task.
- Preserve existing conventions and patterns — match the style of surrounding code.

## Active Technologies
- TypeScript 5.x on Node.js 20 + Fastify, Prisma ORM, Zod, shared `AuditService`, domain port `IAppointmentChecker` (002-tenants-branches)
- PostgreSQL (Supabase). Tables: `tenants`, `branches`. Audit records in shared `audit_logs`. Default time-slots seeded into `appointment_time_slots`. (002-tenants-branches)
- TypeScript 5.6 on React 18.3 + Vite 5.4 + React Router 6 (data router), TanStack React Query 5, Tailwind CSS 3.4, mapbox-gl 3.20, openapi-fetch (014-frontend-app-shell-ux)
- TypeScript 5.x on Node.js 20 + Fastify, Prisma ORM, Zod, shared `AuditService`, existing `AuthorizationService` (015-permissions-rbac-matrix)
- PostgreSQL (Supabase) — `tenants.settings_json` (JSONB) for permission flags; `audit_logs` for denial records (015-permissions-rbac-matrix)
- TypeScript 5.x on Node.js 20 + Fastify, Prisma ORM, Zod, shared `AuditService`, `pg_trgm` for trigram search (021-contacts)
- PostgreSQL (Supabase) — new `contacts` table (per-tenant registry), revised `appointment_contacts` (junction + snapshot pattern), new enums `ContactType`, `ContactChannelType`, `AppointmentContactRole` (021-contacts)
- TypeScript 5.x strict, ES2022 ESM, Node.js 20 (backend), React 18 (PWA). (027-pwa-improvements)
- PostgreSQL via Prisma. New columns: `inspectors.availability_template_json` (JSONB), `inspector_availability_slots.is_operator_override` (BOOLEAN). No new tables. (027-pwa-improvements)
- TypeScript 5.x strict, ES2022 ESM. Node.js 20 (backend); React 18 + Vite 5 + Tailwind 3 (web). + Fastify 4, Prisma 5, Zod, Handlebars (existing renderer), Resend SDK, pg-boss, `@aws-sdk/client-s3` + `s3-request-presigner` (existing storage). New: `sanitize-html` (allowlist sanitizer), `html-to-text` (text derivation), `file-type` (magic-byte sniff) + `image-size` (decode dimensions). See research.md for choices. (030-email-html-rawbody)
- PostgreSQL (Supabase) via Prisma — new tables `email_assets`, `template_image_bindings`; extended `notification_templates` usage (body_html becomes the operator's raw HTML / placeholder-bearing source). New **public** Supabase Storage bucket `email-assets`. (030-email-html-rawbody)

## Recent Changes
- 002-tenants-branches: Added TypeScript 5.x on Node.js 20 + Fastify, Prisma ORM, Zod, shared `AuditService`, domain port `IAppointmentChecker`
