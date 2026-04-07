# Quickstart: Identity & Access

**Feature**: `001-identity-access`
**Status**: IMPLEMENTED (Phase 1)

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+ (Supabase local or remote)
- Environment variables configured (see below)

## Environment Variables

Required in `apps/backend/.env`:

```env
DATABASE_URL=postgresql://...
JWT_PRIVATE_KEY=<RS256 PEM private key>
JWT_PUBLIC_KEY=<RS256 PEM public key>
JWT_KEY_ID=<kid identifier>
JWT_PREVIOUS_PUBLIC_KEY=<optional, for key rotation grace>
JWT_PREVIOUS_KEY_ID=<optional>
TOTP_ENCRYPTION_KEY=<32-byte hex key for encrypting TOTP secrets>
```

## Setup

```bash
# Install dependencies
pnpm install

# Run Prisma migrations
pnpm --filter backend prisma migrate deploy

# Seed the database (creates AM user if needed)
pnpm --filter backend prisma db seed

# Start the backend
pnpm --filter backend dev
```

## Key Endpoints

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/v1/auth/login` | Sign in (email + password + optional TOTP) |
| POST | `/v1/auth/refresh` | Rotate refresh token |
| POST | `/v1/auth/logout` | Revoke current session |
| GET | `/v1/me` | Get authenticated user profile |
| POST | `/v1/auth/change-password` | Change own password |
| POST | `/v1/auth/2fa/setup` | Generate TOTP secret (AM only) |
| POST | `/v1/auth/2fa/confirm` | Confirm TOTP setup |
| GET | `/v1/auth/sessions` | List own sessions |
| DELETE | `/v1/auth/sessions/:id` | Revoke a session |

### User Management

| Method | Path | Description |
|---|---|---|
| POST | `/v1/tenants/:tenantId/users` | Create tenant user |
| POST | `/v1/users` | Create internal user (AM only) |
| GET | `/v1/tenants/:tenantId/users` | List users (paginated) |
| GET | `/v1/tenants/:tenantId/users/:id` | Get user detail |
| PUT | `/v1/tenants/:tenantId/users/:id` | Update user |
| POST | `/v1/tenants/:tenantId/users/:id/deactivate` | Deactivate user |
| POST | `/v1/tenants/:tenantId/users/:id/reset-password` | Admin reset password |

## Running Tests

```bash
# All auth + user tests
pnpm --filter backend test -- --run tests/unit/auth tests/unit/user

# Specific test file
pnpm --filter backend test -- --run tests/unit/auth/login.use-case.test.ts

# With coverage
pnpm --filter backend test -- --coverage
```

## Architecture Overview

```
Request -> auth-middleware (JWT verify, AuthContext) -> Route -> Use Case -> Repository -> Prisma -> PostgreSQL
                                                                  |
                                                            AuditService (side effect)
```

- **Auth module** handles authentication: login, tokens, sessions, TOTP, password changes
- **User module** handles administration: CRUD, RBAC, deactivation, password resets
- **Shared package** provides Zod schemas, TypeScript types, and enums consumed by both backend and frontend
- Every protected route goes through `auth-middleware` which populates `request.authContext`
- RBAC is enforced in use cases, not in routes or middleware
