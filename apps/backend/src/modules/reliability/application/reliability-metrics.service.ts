import type { Prisma } from '@prisma/client';
import {
  RELIABILITY_METRIC_KEYS,
  type ReliabilityIndexSetting,
  type ReliabilityMetricKey,
  type ReliabilityMetricResult,
} from '@properfy/shared';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';
import { buildServiceFacts } from '../domain/build-service-facts';
import { computeMetricFromFacts, type MetricContext } from '../domain/metrics';
import type { IReliabilityFactsReader, ReliabilityFactsRaw } from '../domain/reliability-facts.reader';
import { isCompletedDone, type ServiceFact } from '../domain/service-fact';
import { computeVolumeReference, type VolumeReference } from '../domain/volume-reference';
import { periodLengthDays } from '../domain/volume-prorata';

export interface InspectorReliabilityComputation {
  inspectorId: string;
  volume: number;
  completedCount: number;
  /** Always the 8 metrics, in `RELIABILITY_METRIC_KEYS` order. */
  metrics: ReliabilityMetricResult[];
}

export interface ReliabilityComputationBatch {
  volumeReference: VolumeReference;
  byInspector: Map<string, InspectorReliabilityComputation>;
}

export interface ReliabilitySettingsInput {
  reliabilityIndex: ReliabilityIndexSetting;
  toleranceMinutes: number;
}

type CivilDate = string;

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidRange(from: CivilDate, to: CivilDate): void {
  for (const value of [from, to]) {
    if (!CIVIL_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw new RangeError(`Invalid civil date: ${value}`);
    }
  }
  if (from > to) throw new RangeError('from must be on or before to');
}

function groupByInspector(facts: ServiceFact[]): Map<string, ServiceFact[]> {
  const map = new Map<string, ServiceFact[]>();
  for (const fact of facts) {
    const list = map.get(fact.inspectorId);
    if (list) list.push(fact);
    else map.set(fact.inspectorId, [fact]);
  }
  return map;
}

/** completedCount per inspector from loaded facts (for the median / activeInspectors). */
function completedCountsFromFacts(byInspector: Map<string, ServiceFact[]>): number[] {
  return [...byInspector.values()].map((facts) =>
    facts.filter((f) => !f.lateRejection).filter(isCompletedDone).length,
  );
}

/**
 * Reliability metrics engine (F07-1). Computes the eight metrics and the volume
 * reference for any civil period, in one pass over the facts for all inspectors
 * (or a filtered set). Pure math lives in `domain/`; this service orchestrates the
 * facts reader + the platform settings and decides the volume reference once per
 * call. Consumed by TASK-F07-2 (snapshot job) and F08 (goals).
 */
export class ReliabilityMetricsService {
  constructor(
    private readonly reader: IReliabilityFactsReader,
    private readonly platformSettings: IPlatformSettingsReader,
  ) {}

  /** One metric for one inspector over any civil period. */
  async computeMetric(
    metric: ReliabilityMetricKey,
    inspectorId: string,
    from: CivilDate,
    to: CivilDate,
  ): Promise<ReliabilityMetricResult> {
    assertValidRange(from, to);
    const settings = await this.readSettings();
    const raw = await this.reader.load({ from, to, inspectorIds: [inspectorId] });
    const facts = buildServiceFacts(raw, { from, to });

    let volumeReferenceValue = 1;
    if (metric === 'VOLUME') {
      volumeReferenceValue = (await this.resolveVolumeReferenceForFilteredScope(from, to, settings)).value;
    }

    return computeMetricFromFacts(metric, facts, this.contextFor(from, to, settings, volumeReferenceValue));
  }

  /** All inspectors (optionally a subset) over any civil period. */
  async computeAll(from: CivilDate, to: CivilDate, inspectorIds?: string[]): Promise<ReliabilityComputationBatch> {
    assertValidRange(from, to);
    const settings = await this.readSettings();
    const raw = await this.reader.load({ from, to, inspectorIds });
    return this.assembleBatch(raw, from, to, settings, { filtered: Boolean(inspectorIds) });
  }

  /** Transaction-scoped, unfiltered — used by the F07-2 snapshot job with pre-read settings. */
  async computeAllWith(
    tx: Prisma.TransactionClient,
    from: CivilDate,
    to: CivilDate,
    settings: ReliabilitySettingsInput,
  ): Promise<ReliabilityComputationBatch> {
    assertValidRange(from, to);
    const raw = await this.reader.loadWith(tx, { from, to });
    return this.assembleBatch(raw, from, to, settings, { filtered: false, tx });
  }

  private async readSettings(): Promise<ReliabilitySettingsInput> {
    const [reliabilityIndex, fieldEvents] = await Promise.all([
      this.platformSettings.get('reliabilityIndex'),
      this.platformSettings.get('fieldEvents'),
    ]);
    return { reliabilityIndex, toleranceMinutes: fieldEvents.checkInWindowToleranceMinutes };
  }

  private contextFor(
    from: CivilDate,
    to: CivilDate,
    settings: ReliabilitySettingsInput,
    volumeReference: number,
  ): MetricContext {
    return {
      toleranceMinutes: settings.toleranceMinutes,
      volumeReference,
      minimumRatings: settings.reliabilityIndex.minimumRatings,
      from,
      to,
    };
  }

  /** Volume reference when only a subset of facts was loaded (computeMetric / filtered computeAll). */
  private async resolveVolumeReferenceForFilteredScope(
    from: CivilDate,
    to: CivilDate,
    settings: ReliabilitySettingsInput,
    tx?: Prisma.TransactionClient,
  ): Promise<VolumeReference> {
    const periodDays = periodLengthDays(from, to);
    const override = settings.reliabilityIndex.volumeReferenceOverride;
    if (override !== null) {
      // Override is period-scaled only; no need to read everyone's counts.
      return computeVolumeReference([], override, periodDays);
    }
    const counts = tx
      ? await this.reader.loadCompletedCountsWith(tx, { from, to })
      : await this.reader.loadCompletedCounts({ from, to });
    return computeVolumeReference([...counts.values()], null, periodDays);
  }

  private async assembleBatch(
    raw: ReliabilityFactsRaw,
    from: CivilDate,
    to: CivilDate,
    settings: ReliabilitySettingsInput,
    opts: { filtered: boolean; tx?: Prisma.TransactionClient },
  ): Promise<ReliabilityComputationBatch> {
    const facts = buildServiceFacts(raw, { from, to });
    const byInspectorFacts = groupByInspector(facts);
    const periodDays = periodLengthDays(from, to);
    const override = settings.reliabilityIndex.volumeReferenceOverride;

    let volumeReference: VolumeReference;
    if (override !== null) {
      volumeReference = computeVolumeReference(completedCountsFromFacts(byInspectorFacts), override, periodDays);
    } else if (opts.filtered) {
      // Loaded facts cover only the filter; the median needs every inspector.
      volumeReference = await this.resolveVolumeReferenceForFilteredScope(from, to, settings, opts.tx);
    } else {
      volumeReference = computeVolumeReference(completedCountsFromFacts(byInspectorFacts), null, periodDays);
    }

    const ctx = this.contextFor(from, to, settings, volumeReference.value);
    const byInspector = new Map<string, InspectorReliabilityComputation>();
    for (const [inspectorId, inspectorFacts] of byInspectorFacts) {
      byInspector.set(inspectorId, this.computeInspector(inspectorId, inspectorFacts, ctx));
    }
    return { volumeReference, byInspector };
  }

  private computeInspector(
    inspectorId: string,
    facts: ServiceFact[],
    ctx: MetricContext,
  ): InspectorReliabilityComputation {
    const universe = facts.filter((f) => !f.lateRejection);
    return {
      inspectorId,
      volume: universe.length,
      completedCount: universe.filter(isCompletedDone).length,
      metrics: RELIABILITY_METRIC_KEYS.map((metric) => computeMetricFromFacts(metric, facts, ctx)),
    };
  }
}
