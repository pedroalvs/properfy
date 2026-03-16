-- CreateEnum
CREATE TYPE "ServiceGroupStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PriorityMode" AS ENUM ('STANDARD', 'PRIORITY_24H');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'ANONYMOUS');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "service_group_id" TEXT;

-- CreateTable
CREATE TABLE "service_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_type_id" TEXT NOT NULL,
    "status" "ServiceGroupStatus" NOT NULL DEFAULT 'DRAFT',
    "group_size" INTEGER NOT NULL,
    "offered_count" INTEGER NOT NULL DEFAULT 0,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_date" DATE NOT NULL,
    "time_window" VARCHAR(11) NOT NULL,
    "priority_mode" "PriorityMode" NOT NULL DEFAULT 'STANDARD',
    "priority_expires_at" TIMESTAMP(3),
    "assigned_inspector_id" TEXT,
    "published_at" TIMESTAMP(3),
    "assigned_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" TEXT,
    "action" VARCHAR(200) NOT NULL,
    "reason" TEXT,
    "before_json" JSONB,
    "after_json" JSONB,
    "request_id" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_groups_tenant_id_idx" ON "service_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "service_groups_status_idx" ON "service_groups"("status");

-- CreateIndex
CREATE INDEX "service_groups_scheduled_date_idx" ON "service_groups"("scheduled_date");

-- CreateIndex
CREATE INDEX "service_groups_assigned_inspector_id_idx" ON "service_groups"("assigned_inspector_id");

-- CreateIndex
CREATE INDEX "service_groups_tenant_id_status_idx" ON "service_groups"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "appointments_service_group_id_idx" ON "appointments"("service_group_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_group_id_fkey" FOREIGN KEY ("service_group_id") REFERENCES "service_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_groups" ADD CONSTRAINT "service_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_groups" ADD CONSTRAINT "service_groups_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_groups" ADD CONSTRAINT "service_groups_assigned_inspector_id_fkey" FOREIGN KEY ("assigned_inspector_id") REFERENCES "inspectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_groups" ADD CONSTRAINT "service_groups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
