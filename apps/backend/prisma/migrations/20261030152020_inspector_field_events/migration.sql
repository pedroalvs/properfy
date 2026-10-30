-- CreateEnum
CREATE TYPE "InspectorFieldEventType" AS ENUM ('CANT_DO', 'LATE_NOTICE');

-- AlterTable
ALTER TABLE "inspection_executions" ADD COLUMN     "abandoned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inspector_field_events" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "InspectorFieldEventType" NOT NULL,
    "reason_code" VARCHAR(50) NOT NULL,
    "note" TEXT,
    "minutes" INTEGER,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "accuracy_m" DECIMAL(10,2),
    "client_occurred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspector_field_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspector_field_events_appointment_id_type_created_at_idx" ON "inspector_field_events"("appointment_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inspector_field_events_inspector_id_created_at_idx" ON "inspector_field_events"("inspector_id", "created_at");

-- CreateIndex
CREATE INDEX "inspector_field_events_tenant_id_created_at_idx" ON "inspector_field_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "inspector_field_events_type_created_at_idx" ON "inspector_field_events"("type", "created_at");

-- AddForeignKey
ALTER TABLE "inspector_field_events" ADD CONSTRAINT "inspector_field_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_field_events" ADD CONSTRAINT "inspector_field_events_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_field_events" ADD CONSTRAINT "inspector_field_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
