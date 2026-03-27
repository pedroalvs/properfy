-- CreateTable
CREATE TABLE "appointment_time_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "label" VARCHAR(100) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "appointment_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_time_slots_tenant_id_branch_id_is_active_idx" ON "appointment_time_slots"("tenant_id", "branch_id", "is_active");

-- CreateIndex
CREATE INDEX "appointment_time_slots_tenant_id_is_active_idx" ON "appointment_time_slots"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_time_slots_tenant_id_branch_id_start_time_end_ti_key" ON "appointment_time_slots"("tenant_id", "branch_id", "start_time", "end_time");

-- AddForeignKey
ALTER TABLE "appointment_time_slots" ADD CONSTRAINT "appointment_time_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_time_slots" ADD CONSTRAINT "appointment_time_slots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default time slots for all existing tenants
INSERT INTO "appointment_time_slots" ("id", "tenant_id", "branch_id", "label", "start_time", "end_time", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), t.id, NULL, 'Morning', '09:00', '12:00', 0, true, NOW(), NOW()
FROM "tenants" t
UNION ALL
SELECT gen_random_uuid(), t.id, NULL, 'Afternoon', '14:00', '17:00', 1, true, NOW(), NOW()
FROM "tenants" t;
