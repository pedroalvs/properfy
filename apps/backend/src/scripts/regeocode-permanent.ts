/**
 * One-off legacy permanent re-geocoding script (TASK-X02-2).
 *
 * Properties and branches stored before TASK-X02-1 hold Mapbox TEMPORARY
 * coordinates, which the terms of service forbid storing. This script brings
 * that legacy into permanent-mode compliance, detects and restores the
 * false-`MANUAL` rows left by the (now-fixed) edit bug, strips temporary
 * coordinates out of committed import previews, and offers a bulk resume for
 * properties blocked by a Mapbox account error.
 *
 * It is DRY-RUN by default: no write, no Mapbox call, no enqueue. `--apply`
 * executes. It is idempotent (via the `geocoded_permanently_at` marker),
 * resumable, throttled, and every coordinate write is a compare-and-set on the
 * `updated_at` read at selection, so a concurrent edit is skipped rather than
 * overwritten (and PostGIS `coordinates` stays consistent via the repository).
 *
 * Execution against real data is a separate OPS step gated on TASK-X02-1 being
 * in production — see docs/runbooks/regeocode-permanent.md. Do NOT run --apply
 * against prod from here.
 *
 * Run:
 *   pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts [options]
 */

import {
  MapboxPermanentGeocodingUnavailableError,
  type GeocodingResult,
  type IGeocodingService,
} from '../modules/property/domain/geocoding.service';
import { formatGeocodingQuery, type GeocodableAddress } from '../shared/domain/geocoding-address';
import type {
  ILegacyRegeocodeRepository,
  LegacyBranchCandidate,
  LegacyCoordinateCandidate,
  ManualWithTransitionAudit,
} from '../modules/property/domain/legacy-regeocode.repository';
import type { AuditService } from '../shared/domain/audit';
import type { Logger } from '../shared/infrastructure/logger';

/** Permanent Geocoding list price per request (Mapbox, no free tier). Reconfirm before rollout. */
export const PERMANENT_GEOCODE_USD_PER_REQUEST = 0.005;
/** Above this estimate, a prod `--apply` needs explicit dev sign-off (dec. 13). */
export const REGEOCODE_COST_SIGNOFF_USD = 200;
/** Default throttle: one fifth of the v5 600 req/min limit. */
export const DEFAULT_RATE_PER_MIN = 120;
export const DEFAULT_FALSE_MANUAL_TOLERANCE_M = 5;
export const DEFAULT_MOVE_THRESHOLD_M = 25;
const SELECT_BATCH = 100;

export type RegeocodeEntity = 'properties' | 'branches' | 'false-manual';
const ALL_ENTITIES: RegeocodeEntity[] = ['properties', 'branches', 'false-manual'];

export interface RegeocodeOptions {
  apply: boolean;
  entities: RegeocodeEntity[];
  stripImportPreviews: boolean;
  retryFailedPermanent: boolean;
  falseManualToleranceM: number;
  rate: number;
  moveThresholdM: number;
  tenantId?: string;
  limit?: number;
}

export type AmbiguousReason =
  | 'audit_redacted'
  | 'address_changed_in_transition'
  | 'coordinates_differ'
  | 'no_result'
  | 'geocode_error';

export interface RegeocodeReport {
  dryRun: boolean;
  estimatedRequests: { falseManual: number; properties: number; branches: number; total: number };
  importPreviews: { scanned: number; stripped: number };
  falseManual: {
    manualWithCoordinates: number;
    auditCandidates: number;
    restored: number;
    moved: number;
    skippedConcurrent: number;
    ambiguous: Array<{
      id: string;
      propertyCode: string;
      tenantId: string;
      auditLogId: string;
      reason: AmbiguousReason;
      distanceM: number | null;
      transitionedAt: string;
      addressChangedAfterTransition: boolean;
    }>;
    missingAudit: Array<{ id: string; propertyCode: string; tenantId: string }>;
  };
  properties: {
    scanned: number;
    updated: number;
    moved: number;
    skippedConcurrent: number;
    noResult: Array<{ id: string; propertyCode: string; tenantId: string }>;
    errors: Array<{ id: string; propertyCode: string; message: string }>;
  };
  branches: {
    scanned: number;
    updated: number;
    moved: number;
    skippedConcurrent: number;
    noResult: Array<{ id: string; name: string; tenantId: string }>;
    errors: Array<{ id: string; name: string; message: string }>;
  };
  retriedFailedPermanent: number;
  aborted:
    | null
    | { code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' | 'MAPBOX_NOT_CONFIGURED'; atEntityId: string | null };
}

export interface RegeocodeDeps {
  repo: ILegacyRegeocodeRepository;
  geocoder: IGeocodingService;
  /** DynamicGeocodingService.isConfigured() — resolvable Mapbox config. */
  isGeocoderConfigured: () => Promise<boolean>;
  /** Shared queue `sendJob` — used only by the bulk retry phase. */
  enqueue: (name: string, data: object, opts?: object) => Promise<unknown>;
  auditService: Pick<AuditService, 'log'>;
  logger?: Logger;
  /** Injectable sleep so tests drive the throttle / 429 wait with fake timers. */
  sleep?: (ms: number) => Promise<void>;
}

// --- argument parsing (pure) --------------------------------------------------

export type ParseResult = { options: RegeocodeOptions } | { error: string; exitCode: number };

function parsePositiveInt(raw: string, flag: string, allowZero: boolean): number | { error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || (!allowZero && n === 0)) {
    return { error: `Invalid argument: ${flag}=${raw}` };
  }
  return n;
}

export function parseArgs(argv: string[]): ParseResult {
  const options: RegeocodeOptions = {
    apply: false,
    entities: [...ALL_ENTITIES],
    stripImportPreviews: false,
    retryFailedPermanent: false,
    falseManualToleranceM: DEFAULT_FALSE_MANUAL_TOLERANCE_M,
    rate: DEFAULT_RATE_PER_MIN,
    moveThresholdM: DEFAULT_MOVE_THRESHOLD_M,
  };
  let entitiesExplicit = false;

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--strip-import-previews') {
      options.stripImportPreviews = true;
    } else if (arg === '--retry-failed-permanent') {
      options.retryFailedPermanent = true;
    } else if (arg.startsWith('--entities=')) {
      entitiesExplicit = true;
      const parts = arg.slice('--entities='.length).split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!ALL_ENTITIES.includes(p as RegeocodeEntity)) {
          return { error: `Invalid argument: ${arg}`, exitCode: 2 };
        }
      }
      options.entities = parts as RegeocodeEntity[];
    } else if (arg.startsWith('--false-manual-tolerance-m=')) {
      const v = Number(arg.split('=')[1]);
      if (!Number.isFinite(v) || v <= 0) return { error: `Invalid argument: ${arg}`, exitCode: 2 };
      options.falseManualToleranceM = v;
    } else if (arg.startsWith('--rate=')) {
      const v = Number(arg.split('=')[1]);
      if (!Number.isFinite(v) || v <= 0) return { error: `Invalid argument: ${arg}`, exitCode: 2 };
      options.rate = v;
    } else if (arg.startsWith('--move-threshold-m=')) {
      const v = Number(arg.split('=')[1]);
      if (!Number.isFinite(v) || v < 0) return { error: `Invalid argument: ${arg}`, exitCode: 2 };
      options.moveThresholdM = v;
    } else if (arg.startsWith('--tenant=')) {
      const v = arg.slice('--tenant='.length).trim();
      if (!v) return { error: `Invalid argument: ${arg}`, exitCode: 2 };
      options.tenantId = v;
    } else if (arg.startsWith('--limit=')) {
      const parsed = parsePositiveInt(arg.split('=')[1] ?? '', '--limit', false);
      if (typeof parsed === 'object') return { error: parsed.error, exitCode: 2 };
      options.limit = parsed;
    } else {
      return { error: `Invalid argument: ${arg}`, exitCode: 2 };
    }
  }

  if (options.retryFailedPermanent) {
    if (options.stripImportPreviews) {
      return { error: '--retry-failed-permanent cannot be combined with --strip-import-previews', exitCode: 2 };
    }
    if (entitiesExplicit) {
      return { error: '--retry-failed-permanent cannot be combined with --entities', exitCode: 2 };
    }
  }

  return { options };
}

// --- helpers ------------------------------------------------------------------

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Haversine distance in metres between two WGS84 points. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function isAccountError(err: unknown): err is MapboxPermanentGeocodingUnavailableError {
  return (
    err instanceof MapboxPermanentGeocodingUnavailableError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE')
  );
}

function isRateLimit(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: number }).status;
    if (status === 429) return true;
    const msg = (err as { message?: string }).message;
    if (typeof msg === 'string' && /\b429\b/.test(msg)) return true;
  }
  return false;
}

function propertyQuery(row: {
  street: string;
  addressLine2: string | null;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}): string {
  return formatGeocodingQuery({
    street: row.street,
    addressLine2: row.addressLine2,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    country: row.country,
  });
}

function sameStreetSuburbStateCountry(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (!a || !b) return false;
  const norm = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  return (
    norm(a['street']) === norm(b['street']) &&
    norm(a['suburb']) === norm(b['suburb']) &&
    norm(a['state']) === norm(b['state']) &&
    norm(a['country']) === norm(b['country'])
  );
}

// --- main orchestration -------------------------------------------------------

export async function regeocodePermanent(
  deps: RegeocodeDeps,
  options: RegeocodeOptions,
): Promise<RegeocodeReport> {
  const { repo, geocoder, enqueue, auditService, logger } = deps;
  const sleep = deps.sleep ?? defaultSleep;
  const apply = options.apply;
  const throttleMs = Math.round(60000 / options.rate);

  const report: RegeocodeReport = {
    dryRun: !apply,
    estimatedRequests: { falseManual: 0, properties: 0, branches: 0, total: 0 },
    importPreviews: { scanned: 0, stripped: 0 },
    falseManual: {
      manualWithCoordinates: 0,
      auditCandidates: 0,
      restored: 0,
      moved: 0,
      skippedConcurrent: 0,
      ambiguous: [],
      missingAudit: [],
    },
    properties: { scanned: 0, updated: 0, moved: 0, skippedConcurrent: 0, noResult: [], errors: [] },
    branches: { scanned: 0, updated: 0, moved: 0, skippedConcurrent: 0, noResult: [], errors: [] },
    retriedFailedPermanent: 0,
    aborted: null,
  };

  logger?.info(
    {
      dryRun: report.dryRun,
      phases: {
        stripImportPreviews: options.stripImportPreviews,
        retryFailedPermanent: options.retryFailedPermanent,
      },
      entities: options.entities,
      tenantId: options.tenantId ?? null,
      rate: options.rate,
      limit: options.limit ?? null,
    },
    'regeocode.started',
  );

  // Bulk resume runs alone and never geocodes.
  if (options.retryFailedPermanent) {
    const blocked = await selectAll((cursor, take) =>
      repo.findAccountBlockedProperties(cursor, take, options.tenantId),
      options.limit,
    );
    if (apply) {
      for (const row of blocked) {
        await repo.requeueAccountBlocked(row.id, row.tenantId);
        await enqueue('property.geocode', { propertyId: row.id }, { retryLimit: 6, retryBackoff: true });
        auditService.log({
          action: 'property.geocode_retry_requeued',
          actorType: 'SYSTEM',
          entityType: 'Property',
          entityId: row.id,
          tenantId: row.tenantId,
          metadata: { previousCode: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' },
        });
        report.retriedFailedPermanent++;
      }
      logger?.info({ count: report.retriedFailedPermanent }, 'regeocode.retry_failed_permanent_enqueued');
    } else {
      report.retriedFailedPermanent = blocked.length;
    }
    logger?.info({ report }, 'regeocode.finished');
    return report;
  }

  const willGeocode = options.entities.length > 0;
  // Refuse before touching data if geocoding would fall back to the stub.
  if (apply && willGeocode && !(await deps.isGeocoderConfigured())) {
    report.aborted = { code: 'MAPBOX_NOT_CONFIGURED', atEntityId: null };
    logger?.error({ code: 'MAPBOX_NOT_CONFIGURED' }, 'regeocode.aborted_not_configured');
    logger?.info({ report }, 'regeocode.finished');
    return report;
  }

  // Shared throttle state across every Mapbox call in the run.
  let hasGeocoded = false;
  const geocode = async (query: string): Promise<GeocodingResult | null> => {
    if (hasGeocoded && throttleMs > 0) await sleep(throttleMs);
    hasGeocoded = true;
    return geocoder.geocode(query, { mode: 'permanent' });
  };

  /** Thrown internally to unwind all phases on an account error. */
  class AbortRun {
    constructor(public readonly atEntityId: string) {}
  }

  // A single geocode with one 60s-delayed retry on a 429. Account error → AbortRun.
  const geocodeWithRetry = async (
    query: string,
    entityId: string,
    kind: 'property' | 'branch' | 'false_manual',
  ): Promise<{ result: GeocodingResult | null } | { error: Error }> => {
    try {
      return { result: await geocode(query) };
    } catch (err) {
      if (isAccountError(err)) throw new AbortRun(entityId);
      if (isRateLimit(err)) {
        logger?.warn({ entity: kind, id: entityId }, 'regeocode.rate_limited_retry');
        await sleep(60000);
        try {
          return { result: await geocoder.geocode(query, { mode: 'permanent' }) };
        } catch (err2) {
          if (isAccountError(err2)) throw new AbortRun(entityId);
          return { error: err2 instanceof Error ? err2 : new Error(String(err2)) };
        }
      }
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  try {
    if (options.stripImportPreviews) {
      await runStripImportPreviews(repo, options, report, apply, logger);
    }
    if (options.entities.includes('false-manual')) {
      await runFalseManual(repo, options, report, apply, auditService, logger, geocodeWithRetry);
    }
    if (options.entities.includes('properties')) {
      await runProperties(repo, options, report, apply, auditService, logger, geocodeWithRetry);
    }
    if (options.entities.includes('branches')) {
      await runBranches(repo, options, report, apply, auditService, logger, geocodeWithRetry);
    }
  } catch (err) {
    if (err instanceof AbortRun) {
      report.aborted = { code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE', atEntityId: err.atEntityId };
      logger?.error(
        { code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE', atEntityId: err.atEntityId },
        'regeocode.aborted_account_unavailable',
      );
    } else {
      throw err;
    }
  }

  report.estimatedRequests.total =
    report.estimatedRequests.falseManual +
    report.estimatedRequests.properties +
    report.estimatedRequests.branches;
  logger?.info(report.estimatedRequests, 'regeocode.estimated_requests');
  logger?.info({ report }, 'regeocode.finished');
  return report;
}

// --- paged selection ----------------------------------------------------------

async function selectAll<T extends { id: string }>(
  fetch: (cursor: string | null, take: number) => Promise<T[]>,
  limit: number | undefined,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const take = limit != null ? Math.min(SELECT_BATCH, Math.max(0, limit - out.length)) : SELECT_BATCH;
    if (take <= 0) break;
    const batch = await fetch(cursor, take);
    out.push(...batch);
    if (batch.length < take || batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
  }
  return limit != null ? out.slice(0, limit) : out;
}

// --- phases -------------------------------------------------------------------

type GeocodeWithRetry = (
  query: string,
  entityId: string,
  kind: 'property' | 'branch' | 'false_manual',
) => Promise<{ result: GeocodingResult | null } | { error: Error }>;

async function runStripImportPreviews(
  repo: ILegacyRegeocodeRepository,
  options: RegeocodeOptions,
  report: RegeocodeReport,
  apply: boolean,
  logger: Logger | undefined,
): Promise<void> {
  const rows = await selectAll(
    (cursor, take) => repo.findImportPreviewsToStrip(cursor, take, options.tenantId),
    options.limit,
  );
  report.importPreviews.scanned = rows.length;
  for (const row of rows) {
    const stripped = stripLegacyFoundCoordinates(row.previewJson);
    if (stripped.changed) {
      report.importPreviews.stripped++;
      if (apply) await repo.replaceImportPreview(row.id, row.tenantId, stripped.value);
    }
  }
  logger?.info(
    { scanned: report.importPreviews.scanned, stripped: report.importPreviews.stripped },
    'regeocode.import_previews_stripped',
  );
}

/** Replace every `rows[].property.geocode` with status 'found' and no mode by null. */
export function stripLegacyFoundCoordinates(previewJson: unknown): { changed: boolean; value: unknown } {
  if (typeof previewJson !== 'object' || previewJson === null) return { changed: false, value: previewJson };
  const root = previewJson as { rows?: unknown };
  if (!Array.isArray(root.rows)) return { changed: false, value: previewJson };
  let changed = false;
  for (const row of root.rows) {
    const property = (row as { property?: { geocode?: unknown } } | null)?.property;
    if (!property) continue;
    const geocode = property.geocode as { status?: string; mode?: string } | null | undefined;
    if (geocode && geocode.status === 'found' && !geocode.mode) {
      property.geocode = null;
      changed = true;
    }
  }
  return { changed, value: previewJson };
}

async function runProperties(
  repo: ILegacyRegeocodeRepository,
  options: RegeocodeOptions,
  report: RegeocodeReport,
  apply: boolean,
  auditService: Pick<AuditService, 'log'>,
  logger: Logger | undefined,
  geocodeWithRetry: GeocodeWithRetry,
): Promise<void> {
  const rows = await selectAll(
    (cursor, take) => repo.findLegacyCoordinateCandidates(cursor, take, options.tenantId),
    options.limit,
  );
  report.properties.scanned = rows.length;
  report.estimatedRequests.properties = rows.length;
  if (!apply) return;

  for (const row of rows) {
    const outcome = await geocodeProperty(row, repo, options, report, auditService, geocodeWithRetry);
    logger?.debug({ entity: 'property', id: row.id, ...outcome }, 'regeocode.entity_processed');
  }
}

async function geocodeProperty(
  row: LegacyCoordinateCandidate,
  repo: ILegacyRegeocodeRepository,
  options: RegeocodeOptions,
  report: RegeocodeReport,
  auditService: Pick<AuditService, 'log'>,
  geocodeWithRetry: GeocodeWithRetry,
): Promise<{ outcome: string; distanceM: number | null }> {
  const res = await geocodeWithRetry(propertyQuery(row), row.id, 'property');
  if ('error' in res) {
    report.properties.errors.push({ id: row.id, propertyCode: row.propertyCode, message: res.error.message });
    return { outcome: 'error', distanceM: null };
  }
  if (res.result === null) {
    const wrote = await repo.markLegacyNoResult(row.id, row.tenantId, {
      lat: row.lat,
      lng: row.lng,
      updatedAt: row.updatedAt,
    });
    if (wrote) {
      report.properties.noResult.push({ id: row.id, propertyCode: row.propertyCode, tenantId: row.tenantId });
      auditService.log({
        action: 'property.geocode_permanent_no_result',
        actorType: 'SYSTEM',
        entityType: 'Property',
        entityId: row.id,
        tenantId: row.tenantId,
        metadata: { code: 'LEGACY_PERMANENT_NO_RESULT', keptLegacyCoordinates: true },
      });
      return { outcome: 'no_result', distanceM: null };
    }
    report.properties.skippedConcurrent++;
    return { outcome: 'skipped_concurrent', distanceM: null };
  }

  const next = res.result;
  const wrote = await repo.applyPermanentBackfill(
    row.id,
    row.tenantId,
    { lat: row.lat, lng: row.lng, updatedAt: row.updatedAt },
    { lat: next.lat, lng: next.lng },
  );
  if (!wrote) {
    report.properties.skippedConcurrent++;
    return { outcome: 'skipped_concurrent', distanceM: null };
  }
  const distanceM = haversineMeters(row.lat, row.lng, next.lat, next.lng);
  report.properties.updated++;
  if (distanceM > options.moveThresholdM) report.properties.moved++;
  auditService.log({
    action: 'property.geocode_permanent_backfilled',
    actorType: 'SYSTEM',
    entityType: 'Property',
    entityId: row.id,
    tenantId: row.tenantId,
    before: { lat: row.lat, lng: row.lng, geocodingStatus: 'legacy' },
    after: { lat: next.lat, lng: next.lng, geocodingStatus: 'SUCCESS' },
  });
  return { outcome: distanceM > options.moveThresholdM ? 'moved' : 'updated', distanceM };
}

async function runBranches(
  repo: ILegacyRegeocodeRepository,
  options: RegeocodeOptions,
  report: RegeocodeReport,
  apply: boolean,
  auditService: Pick<AuditService, 'log'>,
  logger: Logger | undefined,
  geocodeWithRetry: GeocodeWithRetry,
): Promise<void> {
  const rows = await selectAll(
    (cursor, take) => repo.findLegacyBranchCandidates(cursor, take, options.tenantId),
    options.limit,
  );
  report.branches.scanned = rows.length;
  report.estimatedRequests.branches = rows.length;
  if (!apply) return;

  for (const row of rows) {
    const outcome = await geocodeBranch(row, repo, options, report, auditService, geocodeWithRetry);
    logger?.debug({ entity: 'branch', id: row.id, ...outcome }, 'regeocode.entity_processed');
  }
}

async function geocodeBranch(
  row: LegacyBranchCandidate,
  repo: ILegacyRegeocodeRepository,
  options: RegeocodeOptions,
  report: RegeocodeReport,
  auditService: Pick<AuditService, 'log'>,
  geocodeWithRetry: GeocodeWithRetry,
): Promise<{ outcome: string; distanceM: number | null }> {
  const query = formatGeocodingQuery(row.addressJson as unknown as GeocodableAddress);
  const res = await geocodeWithRetry(query, row.id, 'branch');
  if ('error' in res) {
    report.branches.errors.push({ id: row.id, name: row.name, message: res.error.message });
    return { outcome: 'error', distanceM: null };
  }
  if (res.result === null) {
    report.branches.noResult.push({ id: row.id, name: row.name, tenantId: row.tenantId });
    return { outcome: 'no_result', distanceM: null };
  }
  const next = res.result;
  const wrote = await repo.backfillBranchCoordinates(
    row.id,
    row.tenantId,
    { updatedAt: row.updatedAt },
    { latitude: next.lat, longitude: next.lng },
  );
  if (!wrote) {
    report.branches.skippedConcurrent++;
    return { outcome: 'skipped_concurrent', distanceM: null };
  }
  const oldLat = Number(row.addressJson['latitude']);
  const oldLng = Number(row.addressJson['longitude']);
  const distanceM =
    Number.isFinite(oldLat) && Number.isFinite(oldLng)
      ? haversineMeters(oldLat, oldLng, next.lat, next.lng)
      : null;
  report.branches.updated++;
  if (distanceM != null && distanceM > options.moveThresholdM) report.branches.moved++;
  auditService.log({
    action: 'branch.geocode_permanent_backfilled',
    actorType: 'SYSTEM',
    entityType: 'Branch',
    entityId: row.id,
    tenantId: row.tenantId,
    before: { latitude: Number.isFinite(oldLat) ? oldLat : null, longitude: Number.isFinite(oldLng) ? oldLng : null },
    after: { latitude: next.lat, longitude: next.lng },
  });
  return { outcome: distanceM != null && distanceM > options.moveThresholdM ? 'moved' : 'updated', distanceM };
}

async function runFalseManual(
  repo: ILegacyRegeocodeRepository,
  options: RegeocodeOptions,
  report: RegeocodeReport,
  apply: boolean,
  auditService: Pick<AuditService, 'log'>,
  logger: Logger | undefined,
  geocodeWithRetry: GeocodeWithRetry,
): Promise<void> {
  const rows = await selectAll(
    (cursor, take) => repo.findManualWithTransitionAudit(cursor, take, options.tenantId),
    options.limit,
  );
  report.falseManual.manualWithCoordinates = rows.length;

  const candidates: ManualWithTransitionAudit[] = [];
  // Audit-only classification (proofs 1): runs in dry-run and apply, no Mapbox.
  for (const row of rows) {
    if (!row.auditLogId) {
      report.falseManual.missingAudit.push({ id: row.id, propertyCode: row.propertyCode, tenantId: row.tenantId });
      logger?.debug(
        { id: row.id, auditLogId: null, outcome: 'missing_audit', reason: null, distanceM: null },
        'regeocode.false_manual_processed',
      );
      continue;
    }
    if ((row.redactionStatus ?? 'NONE') !== 'NONE') {
      pushAmbiguous(report, row, 'audit_redacted', null);
      continue;
    }
    if (!sameStreetSuburbStateCountry(row.beforeJson, row.afterJson)) {
      pushAmbiguous(report, row, 'address_changed_in_transition', null);
      continue;
    }
    candidates.push(row);
  }
  report.falseManual.auditCandidates = candidates.length;
  report.estimatedRequests.falseManual = candidates.length;

  // Proof 2 (distance) runs only on apply.
  if (apply) {
    for (const row of candidates) {
      const res = await geocodeWithRetry(propertyQuery(row), row.id, 'false_manual');
      if ('error' in res) {
        pushAmbiguous(report, row, 'geocode_error', null);
        logFalseManual(logger, row, 'ambiguous', 'geocode_error', null);
        continue;
      }
      if (res.result === null) {
        pushAmbiguous(report, row, 'no_result', null);
        logFalseManual(logger, row, 'ambiguous', 'no_result', null);
        continue;
      }
      const next = res.result;
      const distanceM = haversineMeters(row.lat, row.lng, next.lat, next.lng);
      if (distanceM > options.falseManualToleranceM) {
        pushAmbiguous(report, row, 'coordinates_differ', distanceM);
        logFalseManual(logger, row, 'ambiguous', 'coordinates_differ', distanceM);
        continue;
      }
      const wrote = await repo.restoreFalseManual(
        row.id,
        row.tenantId,
        { lat: row.lat, lng: row.lng, updatedAt: row.updatedAt },
        { lat: next.lat, lng: next.lng },
      );
      if (!wrote) {
        report.falseManual.skippedConcurrent++;
        logFalseManual(logger, row, 'skipped_concurrent', null, distanceM);
        continue;
      }
      report.falseManual.restored++;
      if (distanceM > options.moveThresholdM) report.falseManual.moved++;
      auditService.log({
        action: 'property.false_manual_restored',
        actorType: 'SYSTEM',
        entityType: 'Property',
        entityId: row.id,
        tenantId: row.tenantId,
        before: { lat: row.lat, lng: row.lng, geocodingStatus: 'MANUAL' },
        after: { lat: next.lat, lng: next.lng, geocodingStatus: 'SUCCESS' },
        metadata: { auditLogId: row.auditLogId, distanceM, toleranceM: options.falseManualToleranceM },
      });
      logFalseManual(logger, row, 'restored', null, distanceM);
    }
  }

  // Later-address-change flag for every ambiguous row (audit-only, batched).
  if (report.falseManual.ambiguous.length > 0) {
    const cutoffById: Record<string, Date> = {};
    for (const amb of report.falseManual.ambiguous) {
      const src = rows.find((r) => r.id === amb.id);
      if (src?.transitionedAt) cutoffById[amb.id] = src.transitionedAt;
    }
    if (Object.keys(cutoffById).length > 0) {
      const changed = await repo.findAddressChangesAfter(cutoffById, options.tenantId);
      for (const amb of report.falseManual.ambiguous) {
        amb.addressChangedAfterTransition = changed[amb.id] ?? false;
      }
    }
  }

  const ambiguousByReason: Record<string, number> = {};
  for (const amb of report.falseManual.ambiguous) {
    ambiguousByReason[amb.reason] = (ambiguousByReason[amb.reason] ?? 0) + 1;
  }
  logger?.info(
    {
      manualWithCoordinates: report.falseManual.manualWithCoordinates,
      auditCandidates: report.falseManual.auditCandidates,
      missingAudit: report.falseManual.missingAudit.length,
      ambiguousByReason,
    },
    'regeocode.false_manual_classified',
  );
}

function pushAmbiguous(
  report: RegeocodeReport,
  row: ManualWithTransitionAudit,
  reason: AmbiguousReason,
  distanceM: number | null,
): void {
  report.falseManual.ambiguous.push({
    id: row.id,
    propertyCode: row.propertyCode,
    tenantId: row.tenantId,
    auditLogId: row.auditLogId ?? '',
    reason,
    distanceM,
    transitionedAt: row.transitionedAt ? row.transitionedAt.toISOString() : '',
    addressChangedAfterTransition: false,
  });
}

function logFalseManual(
  logger: Logger | undefined,
  row: ManualWithTransitionAudit,
  outcome: string,
  reason: string | null,
  distanceM: number | null,
): void {
  logger?.debug(
    { id: row.id, auditLogId: row.auditLogId, outcome, reason, distanceM },
    'regeocode.false_manual_processed',
  );
}

// --- CLI entrypoint -----------------------------------------------------------

function maskHost(url: string | undefined): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).host;
  } catch {
    return 'unparseable';
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exit(parsed.exitCode);
  }
  const options = parsed.options;

  const { default: pino } = await import('pino');
  const { createContainer } = await import('../main/container');
  const { sendJob, stopQueue } = await import('../shared/infrastructure/queue');
  const { PrismaPropertyRepository } = await import(
    '../modules/property/infrastructure/prisma-property.repository'
  );

  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
  const container = createContainer(logger);
  const geocoder = container.geocodingService;
  const repo = new PrismaPropertyRepository(container.prisma);

  logger.info({ host: maskHost(process.env['DATABASE_URL']) }, 'regeocode.database');
  console.log(`\n=== regeocode-permanent (${options.apply ? 'APPLY' : 'DRY RUN'}) ===\n`);

  try {
    const report = await regeocodePermanent(
      {
        repo,
        geocoder,
        isGeocoderConfigured: () => geocoder.isConfigured(),
        enqueue: (name, data, opts) => sendJob(name, data as object, opts),
        auditService: container.auditService,
        logger,
      },
      options,
    );

    console.log(JSON.stringify(report, null, 2));
    const cost = Number((report.estimatedRequests.total * PERMANENT_GEOCODE_USD_PER_REQUEST).toFixed(4));
    console.log(`\n  estimated requests : ${report.estimatedRequests.total}`);
    console.log(`  estimated cost     : US$${cost}`);
    if (cost > REGEOCODE_COST_SIGNOFF_USD) {
      console.log(`  ⚠  cost exceeds US$${REGEOCODE_COST_SIGNOFF_USD}: get dev sign-off before --apply in prod.`);
    }
    if (!options.apply) {
      console.log('\n  DRY RUN — no Mapbox call, nothing written. Re-run with --apply.\n');
    }
    if (report.aborted) {
      process.exitCode = 1;
    }
  } finally {
    await stopQueue().catch(() => undefined);
    await container.prisma.$disconnect();
  }
}

export function isDirectInvocation(entrypoint: string | undefined): boolean {
  return /[/\\]regeocode-permanent\.(ts|js)$/.test(entrypoint ?? '');
}

if (isDirectInvocation(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
