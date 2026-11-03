import { describe, expect, it } from 'vitest';
import { ApiError, type PreviewDayPlanOrderResponse } from '@properfy/shared';
import { buildDayPlan } from '../../__fixtures__/day-plan';
import {
  buildReorderPreviewView,
  classifyPreviewReason,
  computeDeltaMin,
  etaByAppointmentId,
  formatDelta,
  formatDrivingTotal,
  formatLocalEta,
  previewUnavailableMessage,
  toViolationMessages,
  type PreviewSlice,
} from '../reorder-preview';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function response(overrides: Partial<PreviewDayPlanOrderResponse> = {}): PreviewDayPlanOrderResponse {
  return {
    etaSource: 'MATRIX',
    approximate: false,
    approximateReason: null,
    departureAt: '2026-11-04T20:50:00.000Z',
    finishEta: '2026-11-04T23:30:00.000Z',
    totals: { driveS: 3300, waitS: 0, serviceS: 5400, lateS: 0, distanceM: null },
    feasible: true,
    violations: [],
    stops: [
      { appointmentId: B, sequence: 1, eta: '2026-11-04T21:00:00.000Z', travelS: 900, waitS: 0, lateS: 0 },
      { appointmentId: A, sequence: 2, eta: '2026-11-04T22:00:00.000Z', travelS: 900, waitS: 0, lateS: 0 },
    ],
    ...overrides,
  };
}

const success = (data: PreviewDayPlanOrderResponse): PreviewSlice => ({ phase: 'SUCCESS', data, reason: null });

describe('pure formatters', () => {
  it('formatDelta', () => {
    expect(formatDelta(12)).toBe('+12 min vs. suggested');
    expect(formatDelta(-5)).toBe('−5 min vs. suggested');
    expect(formatDelta(0)).toBe('Same finish time as suggested');
  });

  it('formatDrivingTotal rounds seconds to minutes', () => {
    expect(formatDrivingTotal(3300)).toBe('55 min driving');
  });

  it('formatLocalEta prefixes "~" and formats in the stop timezone', () => {
    const eta = formatLocalEta(Date.parse('2026-11-04T22:00:00.000Z'), 'Australia/Sydney');
    expect(eta.startsWith('~')).toBe(true);
    expect(formatLocalEta(null, 'Australia/Sydney')).toBe('');
  });

  it('computeDeltaMin rounds the minute difference', () => {
    expect(computeDeltaMin(720_000 + 0, 0)).toBe(12); // 720s later
    expect(computeDeltaMin(0, 300_000)).toBe(-5);
    expect(computeDeltaMin(0, 0)).toBe(0);
    expect(computeDeltaMin(null, 0)).toBeNull();
    expect(computeDeltaMin(0, null)).toBeNull();
  });

  it('etaByAppointmentId maps stop eta ISO strings to epoch ms, skipping nulls', () => {
    const map = etaByAppointmentId(
      response({ stops: [{ appointmentId: A, sequence: 1, eta: null, travelS: 0, waitS: 0, lateS: 0 }] }),
    );
    expect(map[A]).toBeUndefined();
    const full = etaByAppointmentId(response());
    expect(full[A]).toBe(Date.parse('2026-11-04T22:00:00.000Z'));
  });

  it('previewUnavailableMessage differs per reason', () => {
    expect(previewUnavailableMessage('OFFLINE')).toMatch(/offline/i);
    expect(previewUnavailableMessage('STARTED')).toMatch(/started/i);
    expect(previewUnavailableMessage('RATE_LIMIT')).toMatch(/updating/i);
    expect(previewUnavailableMessage('ERROR')).toMatch(/unavailable/i);
    expect(previewUnavailableMessage(null)).toMatch(/unavailable/i);
  });

  it('classifyPreviewReason maps status/code to a reason', () => {
    expect(classifyPreviewReason(new ApiError(422, 'x', 'DAY_PLAN_ALREADY_STARTED'))).toBe('STARTED');
    expect(classifyPreviewReason(new ApiError(429, 'x', 'RATE_LIMITED'))).toBe('RATE_LIMIT');
    expect(classifyPreviewReason(new ApiError(500, 'x', 'SERVER'))).toBe('ERROR');
    expect(classifyPreviewReason(new ApiError(0, 'offline'))).toBe('ERROR');
  });

  it('toViolationMessages numbers by position in the full displayed order', () => {
    const plan = buildDayPlan();
    const displayOrder = plan.stops.map((s) => s.appointmentId);
    const target = plan.stops[1]!;
    const messages = toViolationMessages(plan, displayOrder, [{ appointmentId: target.appointmentId, lateS: 900 }]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message).toMatch(/^Stop 2 would arrive after its window /);
    expect(messages[0]!.appointmentId).toBe(target.appointmentId);
  });
});

describe('buildReorderPreviewView', () => {
  const draft = success(response());

  it('offline → UNAVAILABLE/OFFLINE with no numbers', () => {
    const view = buildReorderPreviewView({ online: false, draft, suggested: null, sameAsSuggested: true });
    expect(view.status).toBe('UNAVAILABLE');
    expect(view.reason).toBe('OFFLINE');
    expect(view.finishMs).toBeNull();
    expect(view.deltaMin).toBeNull();
    expect(view.etaByAppointmentId).toEqual({});
  });

  it('loading (no data yet) → LOADING', () => {
    const view = buildReorderPreviewView({
      online: true,
      draft: { phase: 'LOADING', data: null, reason: null },
      suggested: null,
      sameAsSuggested: true,
    });
    expect(view.status).toBe('LOADING');
  });

  it('success and same as suggested → READY, delta 0, no suggested call needed', () => {
    const view = buildReorderPreviewView({ online: true, draft, suggested: null, sameAsSuggested: true });
    expect(view.status).toBe('READY');
    expect(view.deltaMin).toBe(0);
    expect(view.finishMs).toBe(Date.parse('2026-11-04T23:30:00.000Z'));
    expect(view.driveS).toBe(3300);
    expect(view.etaByAppointmentId[A]).toBe(Date.parse('2026-11-04T22:00:00.000Z'));
  });

  it('flags the view approximate when the draft preview degraded to the stub (200 approximate)', () => {
    const approx = success(response({ approximate: true, approximateReason: 'RATE_LIMITED' }));
    const view = buildReorderPreviewView({ online: true, draft: approx, suggested: null, sameAsSuggested: true });
    expect(view.status).toBe('READY');
    expect(view.approximate).toBe(true);
  });

  it('flags the view approximate when only the suggested baseline degraded', () => {
    const approxSuggested = success(response({ approximate: true, approximateReason: 'PROVIDER_ERROR' }));
    const view = buildReorderPreviewView({ online: true, draft, suggested: approxSuggested, sameAsSuggested: false });
    expect(view.status).toBe('READY');
    expect(view.approximate).toBe(true);
  });

  it('is not approximate when both previews are exact', () => {
    const view = buildReorderPreviewView({ online: true, draft, suggested: null, sameAsSuggested: true });
    expect(view.approximate).toBe(false);
  });

  it('success with a suggested baseline → READY with a computed delta', () => {
    const suggested = success(response({ finishEta: '2026-11-04T23:18:00.000Z' })); // 12 min earlier
    const view = buildReorderPreviewView({ online: true, draft, suggested, sameAsSuggested: false });
    expect(view.status).toBe('READY');
    expect(view.deltaMin).toBe(12);
  });

  it('success but suggested still loading → READY finish, delta null', () => {
    const view = buildReorderPreviewView({
      online: true,
      draft,
      suggested: { phase: 'LOADING', data: null, reason: null },
      sameAsSuggested: false,
    });
    expect(view.status).toBe('READY');
    expect(view.finishMs).not.toBeNull();
    expect(view.deltaMin).toBeNull();
  });

  it('draft error STARTED → UNAVAILABLE/STARTED', () => {
    const view = buildReorderPreviewView({
      online: true,
      draft: { phase: 'ERROR', data: null, reason: 'STARTED' },
      suggested: null,
      sameAsSuggested: true,
    });
    expect(view.status).toBe('UNAVAILABLE');
    expect(view.reason).toBe('STARTED');
    expect(view.deltaMin).toBeNull();
  });

  it('draft error RATE_LIMIT / ERROR → UNAVAILABLE with the reason, no numbers', () => {
    for (const reason of ['RATE_LIMIT', 'ERROR'] as const) {
      const view = buildReorderPreviewView({
        online: true,
        draft: { phase: 'ERROR', data: null, reason },
        suggested: null,
        sameAsSuggested: true,
      });
      expect(view.status).toBe('UNAVAILABLE');
      expect(view.reason).toBe(reason);
      expect(view.finishMs).toBeNull();
    }
  });

  it('exposes per-stop ETAs from stale data while re-fetching, but no final finish', () => {
    const view = buildReorderPreviewView({
      online: true,
      draft: { phase: 'LOADING', data: response(), reason: null },
      suggested: null,
      sameAsSuggested: true,
    });
    expect(view.status).toBe('LOADING');
    expect(view.etaByAppointmentId[A]).toBe(Date.parse('2026-11-04T22:00:00.000Z'));
    expect(view.finishMs).toBeNull();
  });
});
