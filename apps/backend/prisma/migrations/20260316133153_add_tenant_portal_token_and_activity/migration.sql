-- CreateEnum
CREATE TYPE "TenantPortalTokenStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TenantPortalAction" AS ENUM ('VIEW', 'CONFIRM', 'RESCHEDULE', 'CONTACT_UPDATED', 'UNAVAILABLE_REPORTED');

-- CreateTable
CREATE TABLE "tenant_portal_tokens" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "TenantPortalTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_portal_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_portal_activities" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "tenant_portal_token_id" TEXT NOT NULL,
    "action" "TenantPortalAction" NOT NULL,
    "previous_values_json" JSONB,
    "new_values_json" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_portal_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_portal_tokens_token_hash_key" ON "tenant_portal_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "tenant_portal_tokens_appointment_id_idx" ON "tenant_portal_tokens"("appointment_id");

-- CreateIndex
CREATE INDEX "tenant_portal_tokens_status_idx" ON "tenant_portal_tokens"("status");

-- CreateIndex
CREATE INDEX "tenant_portal_tokens_expires_at_idx" ON "tenant_portal_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "tenant_portal_activities_appointment_id_idx" ON "tenant_portal_activities"("appointment_id");

-- CreateIndex
CREATE INDEX "tenant_portal_activities_tenant_portal_token_id_idx" ON "tenant_portal_activities"("tenant_portal_token_id");

-- CreateIndex
CREATE INDEX "tenant_portal_activities_action_idx" ON "tenant_portal_activities"("action");

-- CreateIndex
CREATE INDEX "tenant_portal_activities_created_at_idx" ON "tenant_portal_activities"("created_at");

-- AddForeignKey
ALTER TABLE "tenant_portal_tokens" ADD CONSTRAINT "tenant_portal_tokens_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_portal_activities" ADD CONSTRAINT "tenant_portal_activities_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_portal_activities" ADD CONSTRAINT "tenant_portal_activities_tenant_portal_token_id_fkey" FOREIGN KEY ("tenant_portal_token_id") REFERENCES "tenant_portal_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
