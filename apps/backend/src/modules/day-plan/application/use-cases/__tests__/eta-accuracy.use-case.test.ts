import { describe, it, expect, vi } from 'vitest';
import {
  ROUTE_ETA_ACCURACY_MIN_SAMPLE,
  ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES,
  routeEtaAccuracyQuerySchema,
} from '@properfy/shared';
import { GetRouteEtaAccuracyUseCase } from '../get-route-eta-accuracy.use-case';
import type { EtaAccuracySample, IDayPlanRepository } from '../../../domain/day-plan.repository';

// 2026-11-05 ~midday Sydney (AEDT). Deterministic "today".
const FIXED = new Date('2026-11-05T01:00:00.000Z');

function makeRepo(samples: EtaAccuracySample[]): Pick<IDayPlanRepository, 'getEtaAccuracySamples'> {
  return { getEtaAccuracySamples: vi.fn().mockResolvedValue(samples) };
}

function samplesOf(count: number, errorMinutes: number): EtaAccuracySample[] {
  return Array.from({ length: count }, () => ({ errorMinutes }));
}

function run(samples: EtaAccuracySample[], days = 30) {
  const repo = makeRepo(samples);
  const useCase = new GetRouteEtaAccuracyUseCase(repo as IDayPlanRepository, { now: () => FIXED });
  return { repo, result: useCase.execute({ days }) };
}

describe('GetRouteEtaAccuracyUseCase', () => {
  it('reports OK with the mean absolute error for a healthy sample', async () => {
    const { result } = run(samplesOf(40, 5));
    const r = await result;
    expect(r.meanAbsoluteErrorMinutes).toBe(5);
    expect(r.sampleSize).toBe(40);
    expect(r.excludedOutliers).toBe(0);
    expect(r.status).toBe('OK');
    expect(r.thresholdMinutes).toBe(ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES);
    expect(r.minSampleSize).toBe(ROUTE_ETA_ACCURACY_MIN_SAMPLE);
  });

  it('passes through the published-based error the repository supplies (not the latest ETA)', async () => {
    // The repo query measures |check-in − published start|; a plan published for
    // 09:00 then recomputed to 09:40 with a 09:42 check-in yields a 42-min error,
    // never 2. The use case trusts that sample verbatim.
    const { result } = run([{ errorMinutes: 42 }]);
    const r = await result;
    expect(r.meanAbsoluteErrorMinutes).toBe(42);
    expect(r.sampleSize).toBe(1);
  });

  it('flags ABOVE_THRESHOLD when the mean exceeds 10 minutes', async () => {
    const r = await run(samplesOf(40, 12)).result;
    expect(r.status).toBe('ABOVE_THRESHOLD');
    expect(r.meanAbsoluteErrorMinutes).toBe(12);
  });

  it('reports INSUFFICIENT_DATA below the minimum sample but still computes the mean', async () => {
    const r = await run(samplesOf(29, 4)).result;
    expect(r.sampleSize).toBe(29);
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.meanAbsoluteErrorMinutes).toBe(4);
  });

  it('excludes outliers above 180 minutes from the sample and the mean', async () => {
    const r = await run([...samplesOf(30, 5), { errorMinutes: 200 }]).result;
    expect(r.excludedOutliers).toBe(1);
    expect(r.sampleSize).toBe(30);
    expect(r.meanAbsoluteErrorMinutes).toBe(5);
    expect(r.status).toBe('OK');
  });

  it('returns a null mean and INSUFFICIENT_DATA when there are no usable samples', async () => {
    const r = await run([]).result;
    expect(r.sampleSize).toBe(0);
    expect(r.meanAbsoluteErrorMinutes).toBeNull();
    expect(r.status).toBe('INSUFFICIENT_DATA');
  });

  it('queries a civil window of `days` ending today in the platform timezone', async () => {
    const { repo, result } = run(samplesOf(30, 5), 30);
    await result;
    // 2026-11-05 Sydney today; a 30-day inclusive window starts 2026-10-07.
    expect(repo.getEtaAccuracySamples).toHaveBeenCalledWith('2026-10-07', '2026-11-05');
  });

  it('echoes the requested day span and window in the response', async () => {
    const r = await run(samplesOf(1, 5), 7).result;
    expect(r.days).toBe(7);
    expect(r.to).toBe('2026-11-05');
    expect(r.from).toBe('2026-10-30');
  });
});

describe('routeEtaAccuracyQuerySchema (days bounds)', () => {
  it('accepts 7 and 90', () => {
    expect(routeEtaAccuracyQuerySchema.safeParse({ days: 7 }).success).toBe(true);
    expect(routeEtaAccuracyQuerySchema.safeParse({ days: 90 }).success).toBe(true);
  });

  it('rejects 6 and 91', () => {
    expect(routeEtaAccuracyQuerySchema.safeParse({ days: 6 }).success).toBe(false);
    expect(routeEtaAccuracyQuerySchema.safeParse({ days: 91 }).success).toBe(false);
  });
});
