-- Shared Mapbox call budget (F04 TASK-F04-1, D16/D17). Platform infrastructure:
-- no tenant_id (one Mapbox token per environment). Seeded with three buckets at
-- tokens = capacity; refill_per_minute sits below Mapbox's 30/60/300 per-minute
-- ceilings. The limiter refills with the database clock (clock_timestamp()).

CREATE TABLE "routing_rate_limit_buckets" (
    "bucket" VARCHAR(50) NOT NULL,
    "tokens" DECIMAL(10,4) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "refill_per_minute" INTEGER NOT NULL,
    "refilled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_rate_limit_buckets_pkey" PRIMARY KEY ("bucket")
);

INSERT INTO "routing_rate_limit_buckets" ("bucket", "tokens", "capacity", "refill_per_minute", "refilled_at")
VALUES
    ('matrix:driving-traffic', 25, 25, 25, CURRENT_TIMESTAMP),
    ('matrix:driving', 50, 50, 50, CURRENT_TIMESTAMP),
    ('directions', 250, 250, 250, CURRENT_TIMESTAMP);
