-- F03-1: platform settings + inspection-execution geo capture (expand-only).
-- Hand-trimmed to this feature's changes only: `prisma migrate dev` also emitted
-- pre-existing drift (PostGIS/trgm `Unsupported()` index drops, FK re-creations,
-- tenant_portal_* renames) that does NOT belong to this migration and would drop
-- real indexes — removed. See project_prisma_drift_drops_unsupported_indexes.

-- AlterTable: new capture + geofence columns on inspection_executions (nullable/defaulted)
ALTER TABLE "inspection_executions" ADD COLUMN     "finish_accuracy_m" DECIMAL(10,2),
ADD COLUMN     "finish_client_at" TIMESTAMP(3),
ADD COLUMN     "finish_geolocation_distance_meters" DECIMAL(10,2),
ADD COLUMN     "finish_out_of_radius" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geofence_radius_m" INTEGER,
ADD COLUMN     "out_of_radius" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "out_of_window" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "start_accuracy_m" DECIMAL(10,2),
ADD COLUMN     "start_client_at" TIMESTAMP(3);

-- CreateTable: platform_settings (platform-scoped; no tenant_id)
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- CreateIndex: exception-query indexes for F05/F07
CREATE INDEX "inspection_executions_out_of_radius_started_at_idx" ON "inspection_executions"("out_of_radius", "started_at");

-- CreateIndex
CREATE INDEX "inspection_executions_out_of_window_started_at_idx" ON "inspection_executions"("out_of_window", "started_at");

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
