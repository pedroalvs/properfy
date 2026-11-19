-- Reliability index snapshot (F07-2). Expand-only; ordered after the F07-1
-- migration (20261109000000_inspection_executions_finished_at_idx).
-- Platform-scoped: NO `tenant_id` (the inspector is cross-tenant; documented
-- exception to root CLAUDE.md §7.1). Isolation is by RBAC (reliability.view →
-- AM/OP only). Retained 400 days (purged by the daily SCHEDULED job).

-- CreateTable
CREATE TABLE "inspector_reliability_snapshots" (
    "id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "window_days" INTEGER NOT NULL DEFAULT 30,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "score" DECIMAL(4,1),
    "volume" INTEGER NOT NULL,
    "completed_count" INTEGER NOT NULL,
    "metrics_json" JSONB NOT NULL,
    "settings_json" JSONB NOT NULL,
    "trigger" VARCHAR(30) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspector_reliability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspector_reliability_snapshots_snapshot_date_score_idx" ON "inspector_reliability_snapshots"("snapshot_date", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inspector_reliability_snapshots_inspector_id_snapshot_date_key" ON "inspector_reliability_snapshots"("inspector_id", "snapshot_date");

-- AddForeignKey
ALTER TABLE "inspector_reliability_snapshots" ADD CONSTRAINT "inspector_reliability_snapshots_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: score is within 0–100 when present (not expressible in the Prisma schema).
ALTER TABLE "inspector_reliability_snapshots" ADD CONSTRAINT "inspector_reliability_snapshots_score_range_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));

-- CheckConstraint: score is non-null iff the window is SCORED (status/score coherence).
ALTER TABLE "inspector_reliability_snapshots" ADD CONSTRAINT "inspector_reliability_snapshots_scored_status_check" CHECK (("status" = 'SCORED') = ("score" IS NOT NULL));
