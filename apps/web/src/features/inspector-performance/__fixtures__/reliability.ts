import {
  RELIABILITY_METRIC_KEYS,
  type ReliabilityMetricKey,
  type ReliabilityMetricResult,
  type ReliabilityRankingResponse,
  type InspectorReliabilityResponse,
} from '@properfy/shared';

/**
 * F07-1 worked example (Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0;
 * Carla 9; volumeReference 9.5), in the inner response shape. Hook mocks use the
 * enveloped `{ data }` helpers; schema-shape tests parse the inner objects.
 */
export const INSPECTOR_IDS = {
  eva: '11111111-1111-4111-8111-111111111111',
  fabio: '22222222-2222-4222-8222-222222222222',
  dan: '33333333-3333-4333-8333-333333333333',
  ana: '44444444-4444-4444-8444-444444444444',
  ben: '55555555-5555-4555-8555-555555555555',
  carla: '66666666-6666-4666-8666-666666666666',
} as const;

const APPT_ID = '77777777-7777-4777-8777-777777777777';

/** computedAt chosen so Sydney (AEDT, +11 in December) reads "1 Dec 2026, 4:15 am". */
export const COMPUTED_AT = '2026-11-30T17:15:00.000Z';

export const rankingFixture: ReliabilityRankingResponse = {
  snapshotDate: '2026-12-01',
  windowFrom: '2026-11-01',
  windowTo: '2026-11-30',
  computedAt: COMPUTED_AT,
  isStale: false,
  settingsUpdatedAt: null,
  minimumVolume: 10,
  volumeReference: 9.5,
  volumeReferenceSource: 'MEDIAN',
  ranked: [
    { position: 1, inspectorId: INSPECTOR_IDS.eva, inspectorName: 'Eva Martins', score: 100, volume: 14, completedCount: 14 },
    { position: 2, inspectorId: INSPECTOR_IDS.fabio, inspectorName: 'Fábio Souza', score: 97.5, volume: 11, completedCount: 11 },
    { position: 3, inspectorId: INSPECTOR_IDS.dan, inspectorName: 'Dan Oliveira', score: 89, volume: 8, completedCount: 8 },
    { position: 4, inspectorId: INSPECTOR_IDS.ana, inspectorName: 'Ana Costa', score: 88.3, volume: 12, completedCount: 12 },
    { position: 5, inspectorId: INSPECTOR_IDS.ben, inspectorName: 'Ben Lima', score: 79, volume: 10, completedCount: 10 },
  ],
  notEnoughData: [
    { inspectorId: INSPECTOR_IDS.carla, inspectorName: 'Carla Nunes', volume: 9, status: 'INSUFFICIENT_VOLUME' },
  ],
};

export function rankingEnvelope(overrides: Partial<ReliabilityRankingResponse> = {}): {
  data: ReliabilityRankingResponse;
} {
  return { data: { ...rankingFixture, ...overrides } };
}

type MetricWithWeight = ReliabilityMetricResult & { weight: number };

const BASE_METRIC: Omit<MetricWithWeight, 'metric'> = {
  rate: 1,
  eligibleCount: 12,
  successCount: 12,
  averageRating: null,
  volumeReference: null,
  weightedSuccess: 600,
  weightedEligible: 600,
  volume: 12,
  activeDays: null,
  failureCount: 0,
  failures: [],
  weight: 1,
};

export function makeMetric(
  metric: ReliabilityMetricKey,
  overrides: Partial<MetricWithWeight> = {},
): MetricWithWeight {
  return { ...BASE_METRIC, metric, ...overrides };
}

/** Ana's eight metrics in canonical order, matching the UI-copy examples. */
export const anaMetrics: MetricWithWeight[] = [
  makeMetric('PUNCTUALITY', {
    rate: 0.8333,
    successCount: 10,
    weightedSuccess: 500,
    failureCount: 2,
    failures: [
      { appointmentId: APPT_ID, serviceDate: '2026-11-18', detail: 'Checked in 11:20, window 09:00–11:00, planned 10:50' },
      { appointmentId: APPT_ID, serviceDate: '2026-11-12', detail: 'Checked in 10:05, window 09:00–11:00' },
    ],
  }),
  makeMetric('GEOFENCE', { rate: 0.9167, successCount: 11, weightedSuccess: 550 }),
  makeMetric('NO_STUCK', { rate: 1, successCount: 12 }),
  makeMetric('SATISFACTION', {
    rate: 0.8125,
    eligibleCount: 4,
    successCount: null,
    averageRating: 4.25,
    weightedSuccess: 0,
    weightedEligible: 0,
  }),
  makeMetric('LATE_NOTICE', { rate: 0.5, eligibleCount: 2, successCount: 1, weightedSuccess: 100, weightedEligible: 200 }),
  makeMetric('CANT_ATTEND', { rate: 1, eligibleCount: 12, successCount: 12, weightedSuccess: 1200, weightedEligible: 1200 }),
  makeMetric('VOLUME', {
    rate: 1,
    eligibleCount: 0,
    successCount: 12,
    volumeReference: 9.5,
    weightedSuccess: 0,
    weightedEligible: 0,
    activeDays: 30,
  }),
  makeMetric('DONE_REJECTED', { rate: 1, eligibleCount: 12, successCount: 12 }),
];

const BASE_DETAIL: InspectorReliabilityResponse = {
  inspectorId: INSPECTOR_IDS.ana,
  inspectorName: 'Ana Costa',
  inspectorStatus: 'ACTIVE',
  status: 'SCORED',
  snapshotDate: '2026-12-01',
  windowFrom: '2026-11-01',
  windowTo: '2026-11-30',
  computedAt: COMPUTED_AT,
  isStale: false,
  settingsUpdatedAt: null,
  score: 88.3,
  position: 4,
  rankedCount: 5,
  volume: 12,
  completedCount: 12,
  minimumVolume: 10,
  minimumRatings: 3,
  volumeReference: 9.5,
  volumeReferenceSource: 'MEDIAN',
  metrics: anaMetrics,
};

export const anaDetailFixture: InspectorReliabilityResponse = BASE_DETAIL;

export function makeDetail(overrides: Partial<InspectorReliabilityResponse> = {}): InspectorReliabilityResponse {
  return { ...BASE_DETAIL, ...overrides };
}

export function detailEnvelope(overrides: Partial<InspectorReliabilityResponse> = {}): {
  data: InspectorReliabilityResponse;
} {
  return { data: makeDetail(overrides) };
}

/** Carla — below the minimum volume. */
export const carlaDetailFixture: InspectorReliabilityResponse = makeDetail({
  inspectorId: INSPECTOR_IDS.carla,
  inspectorName: 'Carla Nunes',
  status: 'INSUFFICIENT_VOLUME',
  score: null,
  position: null,
  volume: 9,
  completedCount: 9,
  metrics: RELIABILITY_METRIC_KEYS.map((key) => makeMetric(key, key === 'VOLUME' ? { rate: 1, successCount: 9, volumeReference: 9.5, activeDays: 30 } : {})),
});
