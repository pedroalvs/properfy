-- CreateEnum
CREATE TYPE "InspectionAssetKind" AS ENUM ('PHOTO', 'DOCUMENT', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "InspectionAssetStatus" AS ENUM ('PENDING', 'UPLOADED', 'UPLOAD_FAILED');

-- CreateTable
CREATE TABLE "inspection_executions" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "start_latitude" DECIMAL(10,7) NOT NULL,
    "start_longitude" DECIMAL(10,7) NOT NULL,
    "finish_latitude" DECIMAL(10,7),
    "finish_longitude" DECIMAL(10,7),
    "checklist_json" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_assets" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "inspection_execution_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "kind" "InspectionAssetKind" NOT NULL,
    "status" "InspectionAssetStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by" TEXT NOT NULL,
    "upload_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspection_executions_appointment_id_key" ON "inspection_executions"("appointment_id");

-- CreateIndex
CREATE INDEX "inspection_executions_inspector_id_idx" ON "inspection_executions"("inspector_id");

-- CreateIndex
CREATE INDEX "inspection_executions_started_at_idx" ON "inspection_executions"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_assets_storage_key_key" ON "inspection_assets"("storage_key");

-- CreateIndex
CREATE INDEX "inspection_assets_appointment_id_idx" ON "inspection_assets"("appointment_id");

-- CreateIndex
CREATE INDEX "inspection_assets_inspection_execution_id_idx" ON "inspection_assets"("inspection_execution_id");

-- CreateIndex
CREATE INDEX "inspection_assets_status_idx" ON "inspection_assets"("status");

-- CreateIndex
CREATE INDEX "inspection_assets_uploaded_by_idx" ON "inspection_assets"("uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_key_scope_idx" ON "idempotency_keys"("key", "scope");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey
ALTER TABLE "inspection_executions" ADD CONSTRAINT "inspection_executions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_executions" ADD CONSTRAINT "inspection_executions_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_assets" ADD CONSTRAINT "inspection_assets_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_assets" ADD CONSTRAINT "inspection_assets_inspection_execution_id_fkey" FOREIGN KEY ("inspection_execution_id") REFERENCES "inspection_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
