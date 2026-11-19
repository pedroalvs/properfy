-- F04 Plan B contract phase (PR-C): routing results are recomputed on demand and never stored.
ALTER TABLE "day_plans"
  DROP COLUMN "route_geometry",
  DROP COLUMN "routing_matrix_json",
  DROP COLUMN "leg_travel_json",
  DROP COLUMN "geometry_purged_at";
