/**
 * Narrow, script-scoped repository port for the one-off legacy permanent
 * re-geocoding script (TASK-X02-2, `scripts/regeocode-permanent.ts`).
 *
 * It is deliberately separate from `IPropertyRepository` so the shared
 * interface (and its many consumers) is untouched. It is implemented by the
 * existing `PrismaPropertyRepository` class, which lets the coordinate writes
 * reuse that class's private `syncCoordinates` (PostGIS `coordinates` stays
 * consistent with `lat/lng`). Branch and import helpers are thin raw-SQL
 * methods on the same class (branches and imports have no PostGIS mirror).
 *
 * Every coordinate write is a compare-and-set on the `updated_at` read at
 * selection time, so a concurrent edit between selection and write is skipped
 * rather than overwritten with a stale value. Reads page by `id > cursor`.
 */

/** A legacy property that still holds a temporary (or absent-marker) coordinate. */
export interface LegacyCoordinateCandidate {
  id: string;
  tenantId: string;
  propertyCode: string;
  lat: number;
  lng: number;
  street: string;
  addressLine2: string | null;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  /** CAS token read at selection. */
  updatedAt: Date;
}

/** A legacy branch whose `address_json` holds a `latitude` and has no marker. */
export interface LegacyBranchCandidate {
  id: string;
  tenantId: string;
  name: string;
  /** Raw `address_json` — used to build the geocoding query (its address keys). */
  addressJson: Record<string, unknown>;
  updatedAt: Date;
}

/** A MANUAL property joined with its latest `property.updated → MANUAL` audit transition. */
export interface ManualWithTransitionAudit {
  id: string;
  tenantId: string;
  propertyCode: string;
  lat: number;
  lng: number;
  street: string;
  addressLine2: string | null;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  updatedAt: Date;
  /** null when no transition audit exists → classified `missingAudit`. */
  auditLogId: string | null;
  transitionedAt: Date | null;
  /** `NONE` when present and un-redacted; anything else → `audit_redacted`. */
  redactionStatus: string | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
}

/** A committed import whose `preview_json` may hold legacy `found`-without-mode rows. */
export interface ImportPreviewRow {
  id: string;
  tenantId: string;
  previewJson: unknown;
}

export interface ILegacyRegeocodeRepository {
  // --- selections (paged by id > cursor; `limit` counts selected rows) ---
  findLegacyCoordinateCandidates(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<LegacyCoordinateCandidate[]>;
  findLegacyBranchCandidates(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<LegacyBranchCandidate[]>;
  findManualWithTransitionAudit(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<ManualWithTransitionAudit[]>;
  /**
   * For the given property ids, whether a `property.updated` audit AFTER the
   * row's transition changed street/suburb/state/country (dec. 15). Returns a
   * map id → boolean. No Mapbox call. `transitionedAtById` gives the cutoff per id.
   */
  findAddressChangesAfter(
    transitionedAtById: Record<string, Date>,
    tenantId?: string | null,
  ): Promise<Record<string, boolean>>;
  findImportPreviewsToStrip(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<ImportPreviewRow[]>;
  findAccountBlockedProperties(
    cursor: string | null,
    limit: number,
    tenantId?: string | null,
  ): Promise<Array<{ id: string; tenantId: string }>>;

  // --- writes (all CAS on updated_at; return whether a row changed) ---
  applyPermanentBackfill(
    id: string,
    tenantId: string,
    expected: { lat: number; lng: number; updatedAt: Date },
    next: { lat: number; lng: number },
  ): Promise<boolean>;
  markLegacyNoResult(
    id: string,
    tenantId: string,
    expected: { lat: number; lng: number; updatedAt: Date },
  ): Promise<boolean>;
  restoreFalseManual(
    id: string,
    tenantId: string,
    expected: { lat: number; lng: number; updatedAt: Date },
    next: { lat: number; lng: number },
  ): Promise<boolean>;
  backfillBranchCoordinates(
    id: string,
    tenantId: string,
    expected: { updatedAt: Date },
    next: { latitude: number; longitude: number },
  ): Promise<boolean>;
  /** Overwrite a committed import's `preview_json` (strip phase), tenant-scoped. */
  replaceImportPreview(id: string, tenantId: string, previewJson: unknown): Promise<void>;
  /** Clear the account-error block: set PENDING + null code (retry phase). */
  requeueAccountBlocked(id: string, tenantId: string): Promise<void>;
}
