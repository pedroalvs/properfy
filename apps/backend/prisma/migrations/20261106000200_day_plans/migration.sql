-- CreateEnum
CREATE TYPE "DayPlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'STALE');

-- CreateEnum
CREATE TYPE "DayPlanComputeTrigger" AS ENUM ('SCHEDULED_PUBLISH', 'ON_OPEN', 'MANUAL_RECALC', 'REORDER', 'ORIGIN_CHANGE');

-- CreateEnum
CREATE TYPE "DayPlanOriginSource" AS ENUM ('BASE', 'OVERRIDE', 'NONE', 'LAST_STOP');

-- CreateEnum
CREATE TYPE "RoutingProvider" AS ENUM ('MAPBOX', 'STUB');

-- CreateTable
CREATE TABLE "day_plans" (
    "id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "plan_date" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "status" "DayPlanStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "input_fingerprint" VARCHAR(64) NOT NULL,
    "published_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "computed_at" TIMESTAMP(3) NOT NULL,
    "computed_by_user_id" TEXT,
    "last_trigger" "DayPlanComputeTrigger" NOT NULL,
    "stale_at" TIMESTAMP(3),
    "stale_reason" VARCHAR(50),
    "origin_source" "DayPlanOriginSource" NOT NULL,
    "origin_lat" DECIMAL(10,7),
    "origin_lng" DECIMAL(10,7),
    "origin_override_json" JSONB,
    "origin_override_lat" DECIMAL(10,7),
    "origin_override_lng" DECIMAL(10,7),
    "origin_override_set_at" TIMESTAMP(3),
    "departure_at" TIMESTAMP(3),
    "finish_eta" TIMESTAMP(3),
    "total_drive_s" INTEGER NOT NULL DEFAULT 0,
    "total_wait_s" INTEGER NOT NULL DEFAULT 0,
    "total_service_s" INTEGER NOT NULL DEFAULT 0,
    "total_late_s" INTEGER NOT NULL DEFAULT 0,
    "total_distance_m" INTEGER,
    "feasible" BOOLEAN NOT NULL DEFAULT true,
    "manual_order" BOOLEAN NOT NULL DEFAULT false,
    "suggested_order_json" JSONB NOT NULL,
    "weights_json" JSONB NOT NULL,
    "optimizer_method" VARCHAR(20) NOT NULL,
    "routing_provider" "RoutingProvider" NOT NULL,
    "matrix_profile" VARCHAR(30),
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "approximate_reason" VARCHAR(30),
    "route_geometry" JSONB,
    "routing_matrix_json" JSONB,
    "leg_travel_json" JSONB,
    "geometry_purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_plan_stops" (
    "id" TEXT NOT NULL,
    "day_plan_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eta" TIMESTAMP(3),
    "service_start_at" TIMESTAMP(3),
    "service_end_at" TIMESTAMP(3),
    "published_eta" TIMESTAMP(3),
    "published_service_start_at" TIMESTAMP(3),
    "published_predicted_at" TIMESTAMP(3),
    "published_approximate" BOOLEAN,
    "travel_s" INTEGER NOT NULL DEFAULT 0,
    "distance_m" INTEGER,
    "wait_s" INTEGER NOT NULL DEFAULT 0,
    "late_s" INTEGER NOT NULL DEFAULT 0,
    "window_start_at" TIMESTAMP(3) NOT NULL,
    "window_end_at" TIMESTAMP(3) NOT NULL,
    "window_timezone" VARCHAR(64) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "missing_coordinates" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_plan_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_plans_plan_date_status_idx" ON "day_plans"("plan_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "day_plans_inspector_id_plan_date_key" ON "day_plans"("inspector_id", "plan_date");

-- CreateIndex
CREATE INDEX "day_plan_stops_appointment_id_idx" ON "day_plan_stops"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_plan_stops_day_plan_id_sequence_key" ON "day_plan_stops"("day_plan_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "day_plan_stops_day_plan_id_appointment_id_key" ON "day_plan_stops"("day_plan_id", "appointment_id");

-- AddForeignKey
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_computed_by_user_id_fkey" FOREIGN KEY ("computed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_plan_stops" ADD CONSTRAINT "day_plan_stops_day_plan_id_fkey" FOREIGN KEY ("day_plan_id") REFERENCES "day_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_plan_stops" ADD CONSTRAINT "day_plan_stops_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
