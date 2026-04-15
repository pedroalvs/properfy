# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && \
    corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# Copy package.json files
COPY packages/shared/package.json packages/shared/tsup.config.ts packages/shared/tsconfig.json packages/shared/tsconfig.build.json packages/shared/
COPY apps/backend/package.json apps/backend/tsup.config.ts apps/backend/tsconfig.json apps/backend/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/src/ packages/shared/src/
COPY apps/backend/src/ apps/backend/src/
COPY apps/backend/prisma/ apps/backend/prisma/

# Build shared package
RUN pnpm --filter shared build

# Generate Prisma client
RUN cd apps/backend && npx prisma generate

# Build backend (tsup bundles into single ESM file)
RUN pnpm --filter backend build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/* && \
    npm install -g prisma@5.22.0 && \
    corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built shared package
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/

# Copy Prisma generated client from builder
COPY --from=builder /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/ \
     node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/

# Copy built backend bundle + static assets needed at runtime
COPY --from=builder /app/apps/backend/dist/ apps/backend/dist/
COPY --from=builder /app/apps/backend/src/modules/notification/interfaces/unsubscribe-page.html apps/backend/dist/
COPY --from=builder /app/apps/backend/prisma/ apps/backend/prisma/

WORKDIR /app/apps/backend

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ready || exit 1

CMD ["node", "dist/server.js"]
