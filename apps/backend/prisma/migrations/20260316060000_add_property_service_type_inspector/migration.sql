-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'RURAL');

-- CreateEnum
CREATE TYPE "GeocodingStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ServiceTypeFlowType" AS ENUM ('ROUTINE', 'INGOING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "ServiceTypeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "PriceRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InspectorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AvailabilitySlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "property_code" VARCHAR(50) NOT NULL,
    "type" "PropertyType" NOT NULL,
    "street" VARCHAR(300) NOT NULL,
    "address_line_2" VARCHAR(200),
    "suburb" VARCHAR(100) NOT NULL,
    "postcode" VARCHAR(20) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "country" VARCHAR(100) NOT NULL DEFAULT 'AU',
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "geocoding_status" "GeocodingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "rules_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "flow_type" "ServiceTypeFlowType" NOT NULL,
    "requires_tenant_confirmation" BOOLEAN NOT NULL DEFAULT true,
    "status" "ServiceTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_price_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_type_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "payout_type" "PayoutType" NOT NULL,
    "payout_value" DECIMAL(12,2) NOT NULL,
    "bonus_rule_json" JSONB,
    "status" "PriceRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspectors" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(20),
    "status" "InspectorStatus" NOT NULL DEFAULT 'ACTIVE',
    "payment_settings_json" JSONB NOT NULL DEFAULT '{}',
    "regions_json" JSONB NOT NULL DEFAULT '[]',
    "service_types_json" JSONB NOT NULL DEFAULT '[]',
    "client_eligibility_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inspectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspector_availability_slots" (
    "id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "region_json" JSONB,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" "AvailabilitySlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspector_availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_tenant_id_idx" ON "properties"("tenant_id");

-- CreateIndex
CREATE INDEX "properties_tenant_id_type_idx" ON "properties"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "properties_branch_id_idx" ON "properties"("branch_id");

-- CreateIndex
CREATE INDEX "properties_deleted_at_idx" ON "properties"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "properties_tenant_id_property_code_key" ON "properties"("tenant_id", "property_code");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE INDEX "service_types_status_idx" ON "service_types"("status");

-- CreateIndex
CREATE INDEX "service_price_rules_tenant_id_idx" ON "service_price_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "service_price_rules_service_type_id_idx" ON "service_price_rules"("service_type_id");

-- CreateIndex
CREATE INDEX "service_price_rules_branch_id_idx" ON "service_price_rules"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_price_rules_tenant_id_service_type_id_branch_id_key" ON "service_price_rules"("tenant_id", "service_type_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspectors_email_key" ON "inspectors"("email");

-- CreateIndex
CREATE INDEX "inspectors_status_idx" ON "inspectors"("status");

-- CreateIndex
CREATE INDEX "inspectors_deleted_at_idx" ON "inspectors"("deleted_at");

-- CreateIndex
CREATE INDEX "inspector_availability_slots_inspector_id_idx" ON "inspector_availability_slots"("inspector_id");

-- CreateIndex
CREATE INDEX "inspector_availability_slots_inspector_id_date_idx" ON "inspector_availability_slots"("inspector_id", "date");

-- CreateIndex
CREATE INDEX "inspector_availability_slots_inspector_id_status_idx" ON "inspector_availability_slots"("inspector_id", "status");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_price_rules" ADD CONSTRAINT "service_price_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_price_rules" ADD CONSTRAINT "service_price_rules_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_price_rules" ADD CONSTRAINT "service_price_rules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_availability_slots" ADD CONSTRAINT "inspector_availability_slots_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
