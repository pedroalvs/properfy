-- Appointment-import redesign: back the "perfect address match" property-reuse
-- rule with a real DB constraint. Today the only unique constraint on
-- properties is (tenant_id, property_code); nothing stops two concurrent
-- inserts (or a retried import-commit job) from both creating a property for
-- the same address. Adds a deterministic normalized-address key column, a
-- BEFORE INSERT/UPDATE trigger that always (re)computes it from the row's own
-- address fields, and a partial unique index over active (non-soft-deleted)
-- rows.
--
-- The trigger — rather than requiring every INSERT to supply the column
-- explicitly — means pre-existing test fixtures, seed scripts and any future
-- code path that creates a property directly (bypassing the repository)
-- automatically gets a correct value with zero changes. `@default("")` in
-- schema.prisma only exists so Prisma's generated Create input treats the
-- field as optional; the literal default is never what actually lands in a
-- committed row.
--
-- Expand/contract within one migration (NOT NULL column on a populated
-- table): add nullable -> backfill -> guard against pre-existing duplicates
-- -> set NOT NULL -> create the unique index -> install the trigger for all
-- future writes.
--
-- The SQL normalization here (and in the trigger function) MUST stay
-- identical to `shared/domain/normalize-address.ts` (trim + collapse internal
-- whitespace + lowercase, address_line_2 coalesced to '') — that JS twin is
-- used by `findByNormalizedAddress`'s query and the appointment-import
-- resolver's intra-batch grouping, and both must agree with what's actually
-- persisted.

-- 1) Add the column, nullable for now.
ALTER TABLE "properties" ADD COLUMN "normalized_address_key" VARCHAR(750);

-- 2) Backfill every existing row.
UPDATE "properties"
SET "normalized_address_key" =
  lower(regexp_replace(btrim(street), '\s+', ' ', 'g')) || '|' ||
  lower(regexp_replace(btrim(coalesce(address_line_2, '')), '\s+', ' ', 'g')) || '|' ||
  lower(regexp_replace(btrim(suburb), '\s+', ' ', 'g')) || '|' ||
  lower(regexp_replace(btrim(state), '\s+', ' ', 'g')) || '|' ||
  lower(regexp_replace(btrim(postcode), '\s+', ' ', 'g'));

-- 3) Dedup guard. If any tenant already has two ACTIVE properties sharing the
--    same normalized address, abort loudly rather than let step 5's
--    CREATE UNIQUE INDEX fail with an opaque constraint-violation error —
--    mirrors the 024 contacts-cross-tenant migration's dedup pre-check.
DO $$
DECLARE
  address_dups bigint;
BEGIN
  SELECT count(*) INTO address_dups FROM (
    SELECT tenant_id, normalized_address_key
    FROM "properties"
    WHERE deleted_at IS NULL
    GROUP BY tenant_id, normalized_address_key
    HAVING count(*) > 1
  ) sub;

  IF address_dups > 0 THEN
    RAISE EXCEPTION
      'Property address dedup pre-check failed (% duplicate active address groups). Resolve (merge or soft-delete the extras) before re-applying this migration.',
      address_dups;
  END IF;
END $$;

-- 4) Enforce NOT NULL now that every row has a value.
ALTER TABLE "properties" ALTER COLUMN "normalized_address_key" SET NOT NULL;

-- 5) Partial unique index — soft-deleted properties don't block a fresh
--    property from reusing their address.
CREATE UNIQUE INDEX "properties_normalized_address_active_unique"
  ON "properties" ("tenant_id", "normalized_address_key")
  WHERE "deleted_at" IS NULL;

-- 6) Trigger: always recompute the key from the row's own address fields on
--    every future INSERT or UPDATE, regardless of what (if anything) the
--    caller supplied. Keeps the column correct for every write path forever,
--    including ones that predate or are unaware of this feature.
CREATE OR REPLACE FUNCTION normalize_property_address() RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_address_key :=
    lower(regexp_replace(btrim(NEW.street), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(coalesce(NEW.address_line_2, '')), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(NEW.suburb), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(NEW.state), '\s+', ' ', 'g')) || '|' ||
    lower(regexp_replace(btrim(NEW.postcode), '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER properties_normalize_address_trigger
  BEFORE INSERT OR UPDATE ON "properties"
  FOR EACH ROW
  EXECUTE FUNCTION normalize_property_address();
