-- CreateTable
CREATE TABLE "app_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "username" VARCHAR(200) NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_app_credentials" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "app_credential_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_app_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_credentials_tenant_id_is_active_idx" ON "app_credentials"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "app_credentials_tenant_id_name_idx" ON "app_credentials"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "appointment_app_credentials_appointment_id_idx" ON "appointment_app_credentials"("appointment_id");

-- CreateIndex
CREATE INDEX "appointment_app_credentials_app_credential_id_idx" ON "appointment_app_credentials"("app_credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_app_credentials_appointment_id_app_credential_i_key" ON "appointment_app_credentials"("appointment_id", "app_credential_id");

-- AddForeignKey
ALTER TABLE "app_credentials" ADD CONSTRAINT "app_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_app_credentials" ADD CONSTRAINT "appointment_app_credentials_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_app_credentials" ADD CONSTRAINT "appointment_app_credentials_app_credential_id_fkey" FOREIGN KEY ("app_credential_id") REFERENCES "app_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
