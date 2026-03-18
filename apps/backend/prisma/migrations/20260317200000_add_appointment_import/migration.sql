-- CreateTable
CREATE TABLE "appointment_imports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "file_key" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "errors_json" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_imports_tenant_id_idx" ON "appointment_imports"("tenant_id");

-- CreateIndex
CREATE INDEX "appointment_imports_status_idx" ON "appointment_imports"("status");

-- CreateIndex
CREATE INDEX "appointment_imports_created_by_user_id_idx" ON "appointment_imports"("created_by_user_id");

-- CreateIndex
CREATE INDEX "appointment_imports_created_at_idx" ON "appointment_imports"("created_at");

-- AddForeignKey
ALTER TABLE "appointment_imports" ADD CONSTRAINT "appointment_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_imports" ADD CONSTRAINT "appointment_imports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
