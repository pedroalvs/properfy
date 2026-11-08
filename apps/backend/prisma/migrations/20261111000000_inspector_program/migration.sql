-- Inspector program (F08): goals, rewards, period closures. Platform-scoped (no
-- tenant_id). Expand-only, ordered after the F07 migrations. This migration is
-- curated to be purely additive: `prisma migrate diff` also reports spurious
-- drops of raw-SQL/Unsupported() indexes (service_regions_geom_idx,
-- properties_coordinates_idx, contacts_display_name_trgm_idx) and portal
-- constraint/index renames that are already correct in the applied DB — those are
-- intentionally NOT included here (see project_prisma_drift_drops_unsupported_indexes).

-- CreateEnum
CREATE TYPE "GoalMetric" AS ENUM ('VOLUME', 'REGION_VOLUME', 'SERVICE_TYPE_VOLUME', 'INDEX_AT_LEAST', 'PUNCTUALITY', 'GEOFENCE', 'NO_STUCK', 'SATISFACTION', 'LATE_NOTICE', 'CANT_DO_MAX');

-- CreateEnum
CREATE TYPE "GoalComparator" AS ENUM ('GTE', 'LTE');

-- CreateEnum
CREATE TYPE "RewardAwardStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "inspector_goals" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "metric" "GoalMetric" NOT NULL,
    "comparator" "GoalComparator" NOT NULL,
    "target" DECIMAL(8,2) NOT NULL,
    "period" "BillingPeriodType" NOT NULL,
    "scope_region_id" TEXT,
    "scope_service_type_id" TEXT,
    "scope_inspector_id" TEXT,
    "reward_amount" DECIMAL(10,2) NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMP(3),
    "next_target" DECIMAL(8,2),
    "next_reward_amount" DECIMAL(10,2),
    "next_effective_from" DATE,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspector_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_awards" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "period_type" "BillingPeriodType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "goal_title" VARCHAR(120) NOT NULL,
    "metric" "GoalMetric" NOT NULL,
    "comparator" "GoalComparator" NOT NULL,
    "target" DECIMAL(8,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "scope_label" VARCHAR(200),
    "achieved_value" DECIMAL(8,2) NOT NULL,
    "service_count" INTEGER NOT NULL,
    "achieved_on" DATE NOT NULL,
    "index_score_at_close" DECIMAL(4,1),
    "level_at_close" VARCHAR(10),
    "index_snapshot_date" DATE,
    "status" "RewardAwardStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "voided_by_user_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" VARCHAR(500),
    "inspector_note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_period_closures" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "period_type" "BillingPeriodType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "participant_ids" TEXT[],
    "participants_count" INTEGER NOT NULL,
    "achievers_count" INTEGER NOT NULL,
    "promised_amount" DECIMAL(12,2) NOT NULL,
    "scope_label" VARCHAR(200),
    "index_snapshot_date" DATE,
    "trigger" VARCHAR(20) NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_period_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspector_goals_active_period_idx" ON "inspector_goals"("active", "period");

-- CreateIndex
CREATE INDEX "inspector_goals_scope_region_id_idx" ON "inspector_goals"("scope_region_id");

-- CreateIndex
CREATE INDEX "inspector_goals_scope_inspector_id_idx" ON "inspector_goals"("scope_inspector_id");

-- CreateIndex
CREATE INDEX "reward_awards_status_period_end_idx" ON "reward_awards"("status", "period_end");

-- CreateIndex
CREATE INDEX "reward_awards_inspector_id_period_end_idx" ON "reward_awards"("inspector_id", "period_end");

-- CreateIndex
CREATE INDEX "reward_awards_period_type_period_start_idx" ON "reward_awards"("period_type", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "reward_awards_goal_id_inspector_id_period_start_key" ON "reward_awards"("goal_id", "inspector_id", "period_start");

-- CreateIndex
CREATE INDEX "goal_period_closures_period_type_period_start_idx" ON "goal_period_closures"("period_type", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "goal_period_closures_goal_id_period_start_key" ON "goal_period_closures"("goal_id", "period_start");

-- AddForeignKey
ALTER TABLE "inspector_goals" ADD CONSTRAINT "inspector_goals_scope_region_id_fkey" FOREIGN KEY ("scope_region_id") REFERENCES "service_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_goals" ADD CONSTRAINT "inspector_goals_scope_service_type_id_fkey" FOREIGN KEY ("scope_service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_goals" ADD CONSTRAINT "inspector_goals_scope_inspector_id_fkey" FOREIGN KEY ("scope_inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_goals" ADD CONSTRAINT "inspector_goals_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_goals" ADD CONSTRAINT "inspector_goals_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "inspector_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_period_closures" ADD CONSTRAINT "goal_period_closures_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "inspector_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (hand-authored; Prisma does not model CHECK, so they never drift).
ALTER TABLE "inspector_goals"
  ADD CONSTRAINT "inspector_goals_scope_chk" CHECK (
    (("metric" = 'REGION_VOLUME') OR "scope_region_id" IS NULL)
    AND (("metric" <> 'REGION_VOLUME') OR "scope_region_id" IS NOT NULL OR NOT "active")
    AND (("metric" = 'SERVICE_TYPE_VOLUME') = ("scope_service_type_id" IS NOT NULL))),
  ADD CONSTRAINT "inspector_goals_comparator_chk" CHECK (("metric" = 'CANT_DO_MAX') = ("comparator" = 'LTE')),
  ADD CONSTRAINT "inspector_goals_dates_chk" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
  ADD CONSTRAINT "inspector_goals_values_chk" CHECK ("target" > 0 AND "reward_amount" > 0),
  ADD CONSTRAINT "inspector_goals_active_chk" CHECK ("active" = ("deactivated_at" IS NULL)),
  ADD CONSTRAINT "inspector_goals_next_terms_chk" CHECK (
    ("next_target" IS NOT NULL OR "next_reward_amount" IS NOT NULL) = ("next_effective_from" IS NOT NULL)
    AND ("next_target" IS NULL OR "next_target" > 0)
    AND ("next_reward_amount" IS NULL OR "next_reward_amount" > 0));

ALTER TABLE "reward_awards"
  ADD CONSTRAINT "reward_awards_status_fields_chk" CHECK (
    ("status" IN ('APPROVED','PAID')) <= ("approved_by_user_id" IS NOT NULL)
    AND ("status" = 'PAID') <= ("paid_at" IS NOT NULL)
    AND ("paid_at" IS NOT NULL) <= ("status" IN ('PAID','VOID'))
    AND ("inspector_note" IS NOT NULL) <= ("status" = 'VOID')
    AND ("status" = 'VOID') = ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL));
