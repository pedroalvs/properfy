-- Case-insensitive unique index on service_type name.
-- lower(name) ensures "Routine Inspection" and "routine inspection" conflict,
-- consistent with the application-layer findByName(mode: 'insensitive') check.
CREATE UNIQUE INDEX "service_types_name_ci_key" ON "service_types"(lower("name"));
