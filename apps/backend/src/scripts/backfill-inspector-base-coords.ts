/**
 * One-off backfill of inspector base-address coordinates (F01-1).
 *
 * Inspectors created before F01-1 have a stored `address` but no `base_lat`.
 * This script geocodes those addresses in permanent mode and fills the
 * coordinates. It is idempotent (only rows with a null `base_lat` are selected),
 * throttled, and never overwrites a concurrent save (compare-and-set).
 *
 * Dry run by default: makes NO Mapbox call and needs NO config — it only reports
 * what would be geocoded and which legacy addresses do not parse. `--apply`
 * geocodes and writes; it aborts up front if Mapbox is not configured, and aborts
 * the whole run if the account rejects permanent mode.
 *
 * Run:
 *   pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-base-coords.ts
 *   pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-base-coords.ts --apply
 */

import { Prisma } from '@prisma/client';
import { inspectorBaseAddressSchema, type InspectorBaseAddress } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import type { IGeocodingService } from '../modules/property/domain/geocoding.service';
import { geocodeInspectorBase } from '../modules/inspector/application/services/geocode-inspector-base';
import { INSPECTOR_EVENTS } from '../modules/inspector/domain/inspector-events';
import type { AuditService } from '../shared/infrastructure/audit';
import type { DomainEventBus } from '../shared/application/events/domain-event-bus';
import type { Logger } from '../shared/infrastructure/logger';
import { type Clock, SystemClock } from '../shared/domain/clock';

/** Permanent Geocoding list price per request (Mapbox, no free tier). Reconfirm. */
export const PERMANENT_GEOCODE_USD_PER_REQUEST = 0.005;
/** Above this estimate, a prod `--apply` needs explicit dev sign-off (D19). */
export const BACKFILL_COST_SIGNOFF_USD = 200;

export interface BackfillIncompatible {
  inspectorId: string;
  issues: Array<{ path: (string | number)[]; message: string }>;
}

export interface BackfillFailure {
  inspectorId: string;
  reason: 'error' | 'timeout';
}

export interface BackfillReport {
  dryRun: boolean;
  scanned: number;
  compatible: number;
  incompatible: BackfillIncompatible[];
  toGeocode: number;
  estimatedRequests: number;
  estimatedCostUsd: number;
  // apply-only fields
  geocoded?: number;
  notFound?: string[];
  failed?: BackfillFailure[];
  skippedConcurrent?: number;
}

/** Raised (before any read) when `--apply` runs without a resolvable Mapbox config. */
export class MapboxNotConfiguredError extends Error {
  constructor() {
    super('Mapbox integration not configured: refusing to run');
    this.name = 'MapboxNotConfiguredError';
  }
}

export interface BackfillDeps {
  prisma: PrismaClient;
  geocoder: IGeocodingService;
  /** Whether a Mapbox config is resolvable; checked only on `--apply`. */
  isConfigured: () => Promise<boolean>;
  auditService: Pick<AuditService, 'log'>;
  eventBus?: Pick<DomainEventBus, 'emit'>;
  logger?: Logger;
  clock?: Clock;
  /** Injectable sleep so tests can drive the throttle with fake timers. */
  sleep?: (ms: number) => Promise<void>;
}

export interface BackfillOptions {
  apply: boolean;
  delayMs?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function backfillInspectorBaseCoords(
  deps: BackfillDeps,
  options: BackfillOptions,
): Promise<BackfillReport> {
  const { prisma, geocoder, auditService, eventBus, logger } = deps;
  const clock = deps.clock ?? new SystemClock();
  const sleep = deps.sleep ?? defaultSleep;
  const delayMs = options.delayMs ?? 250;

  // On apply, refuse before touching data if geocoding would fall back to the stub.
  if (options.apply && !(await deps.isConfigured())) {
    throw new MapboxNotConfiguredError();
  }

  // Idempotent selection: skip located rows, SQL NULL and JSON `null` addresses.
  const rows = await prisma.inspector.findMany({
    where: {
      deleted_at: null,
      base_lat: null,
      AND: [{ address: { not: Prisma.DbNull } }, { address: { not: Prisma.JsonNull } }],
    },
    select: { id: true, address: true },
  });

  const incompatible: BackfillIncompatible[] = [];
  const compatible: Array<{ id: string; address: InspectorBaseAddress }> = [];
  for (const row of rows) {
    const parsed = inspectorBaseAddressSchema.safeParse(row.address);
    if (!parsed.success) {
      incompatible.push({
        inspectorId: row.id,
        issues: parsed.error.issues.map((i) => ({ path: [...i.path], message: i.message })),
      });
      continue;
    }
    compatible.push({ id: row.id, address: parsed.data });
  }

  const estimatedRequests = compatible.length;
  const report: BackfillReport = {
    dryRun: !options.apply,
    scanned: rows.length,
    compatible: compatible.length,
    incompatible,
    toGeocode: compatible.length,
    estimatedRequests,
    estimatedCostUsd: Number((estimatedRequests * PERMANENT_GEOCODE_USD_PER_REQUEST).toFixed(4)),
  };

  if (!options.apply) {
    return report;
  }

  const notFound: string[] = [];
  const failed: BackfillFailure[] = [];
  let geocoded = 0;
  let skippedConcurrent = 0;

  for (let idx = 0; idx < compatible.length; idx++) {
    const { id, address } = compatible[idx]!;
    const geo = await geocodeInspectorBase(geocoder, address, logger, clock);

    if ('failed' in geo) {
      if (geo.failed === 'permanent_unavailable') {
        // Account-level failure: every row would fail — abort the whole run.
        throw new Error('MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE');
      }
      if (geo.failed === 'no_results') {
        notFound.push(id);
      } else {
        failed.push({ inspectorId: id, reason: geo.failed });
      }
    } else {
      // Compare-and-set: never overwrite a save that landed between scan and write.
      const updated = await prisma.inspector.updateMany({
        where: { id, base_lat: null },
        data: { base_lat: geo.lat, base_lng: geo.lng, base_geocoded_at: geo.geocodedAt },
      });
      if (updated.count > 0) {
        geocoded++;
        auditService.log({
          action: 'inspector.base_geocoded',
          actorType: 'SYSTEM',
          entityType: 'Inspector',
          entityId: id,
          after: { baseLocated: true, baseGeocodedAt: geo.geocodedAt },
          metadata: { source: 'backfill' },
        });
        if (eventBus) {
          try {
            await eventBus.emit({
              type: INSPECTOR_EVENTS.BASE_CHANGED,
              payload: { inspectorId: id, hadCoordinates: false, hasCoordinates: true },
              occurredAt: new Date(),
            });
          } catch (err) {
            logger?.warn(
              { inspectorId: id, err: err instanceof Error ? err.message : String(err) },
              'inspector.base_changed_emit_failed',
            );
          }
        }
      } else {
        skippedConcurrent++;
      }
    }

    // Throttle between geocode calls (not after the last).
    if (idx < compatible.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { ...report, geocoded, notFound, failed, skippedConcurrent };
}

async function main() {
  const { default: pino } = await import('pino');
  const { createContainer } = await import('../main/container');
  const apply = process.argv.includes('--apply');
  const delayArg = process.argv.find((a) => a.startsWith('--delay-ms='));
  const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 250;

  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
  const container = createContainer(logger);
  const geocoder = container.geocodingService;

  console.log(`\n=== backfill-inspector-base-coords (${apply ? 'APPLY' : 'DRY RUN'}) ===\n`);
  try {
    const report = await backfillInspectorBaseCoords(
      {
        prisma: container.prisma,
        geocoder,
        isConfigured: () => geocoder.isConfigured(),
        auditService: container.auditService,
        eventBus: container.domainEventBus,
        logger,
      },
      { apply, delayMs },
    );

    console.log(JSON.stringify(report, null, 2));
    console.log(`\n  scanned            : ${report.scanned}`);
    console.log(`  compatible         : ${report.compatible}`);
    console.log(`  incompatible       : ${report.incompatible.length}`);
    console.log(`  estimated requests : ${report.estimatedRequests}`);
    console.log(`  estimated cost     : US$${report.estimatedCostUsd}`);
    if (report.estimatedCostUsd > BACKFILL_COST_SIGNOFF_USD) {
      console.log(`  ⚠  cost exceeds US$${BACKFILL_COST_SIGNOFF_USD}: get dev sign-off before --apply in prod.`);
    }
    if (apply) {
      console.log(`  geocoded           : ${report.geocoded}`);
      console.log(`  not found          : ${report.notFound?.length ?? 0}`);
      console.log(`  failed             : ${report.failed?.length ?? 0}`);
      console.log(`  skipped (concurrent): ${report.skippedConcurrent ?? 0}`);
    } else {
      console.log('\n  DRY RUN — no Mapbox call, nothing written. Re-run with --apply.\n');
    }
  } finally {
    await container.prisma.$disconnect();
  }
}

export function isDirectInvocation(entrypoint: string | undefined): boolean {
  return /[/\\]backfill-inspector-base-coords\.(ts|js)$/.test(entrypoint ?? '');
}

if (isDirectInvocation(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
