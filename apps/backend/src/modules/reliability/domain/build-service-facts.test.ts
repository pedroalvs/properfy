import { describe, it, expect } from 'vitest';
import { buildServiceFacts } from './build-service-facts';
import type {
  ReliabilityCantAttendRow,
  ReliabilityDoneRow,
  ReliabilityFactsRaw,
  ReliabilityNoShowRow,
  ReliabilityPlanStopRow,
} from './reliability-facts.reader';

const RANGE = { from: '2026-11-01', to: '2026-11-30' };

function base<T extends object>(over: T) {
  return {
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    tenantId: 'tenant-1',
    timezone: 'Australia/Sydney',
    scheduledDate: '2026-11-10',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    defaultDurationMinutes: 45,
    inspectorCreatedAt: new Date('2026-01-01T00:00:00Z'),
    serviceDate: '2026-11-10',
    ...over,
  };
}

function doneRow(over: Partial<ReliabilityDoneRow> = {}): ReliabilityDoneRow {
  return base({
    origin: 'CURRENT_DONE',
    doneRejected: false,
    rejectedOn: null,
    startedAt: new Date('2026-11-09T22:30:00Z'),
    startClientAt: null,
    finishedAt: new Date('2026-11-09T23:30:00Z'),
    resumedAt: null,
    outOfWindow: false,
    outOfRadius: false,
    finishOutOfRadius: false,
    geolocationDistanceMeters: 50,
    finishGeolocationDistanceMeters: 50,
    startAccuracyM: 20,
    finishAccuracyM: 20,
    geofenceRadiusM: 300,
    ...over,
  }) as ReliabilityDoneRow;
}

function cantAttendRow(over: Partial<ReliabilityCantAttendRow> = {}): ReliabilityCantAttendRow {
  return base({ clientOccurredAt: null, createdAt: new Date('2026-11-10T00:00:00Z'), ...over }) as ReliabilityCantAttendRow;
}

function noShowRow(over: Partial<ReliabilityNoShowRow> = {}): ReliabilityNoShowRow {
  return base({ ...over }) as ReliabilityNoShowRow;
}

function raw(parts: Partial<ReliabilityFactsRaw>): ReliabilityFactsRaw {
  return {
    done: [],
    cantAttend: [],
    noShow: [],
    planStops: [],
    surveys: [],
    lateNotices: [],
    ...parts,
  };
}

describe('buildServiceFacts — dedup', () => {
  it('drops a CANT_ATTEND when the same inspector has a DONE on that appointment', () => {
    const facts = buildServiceFacts(raw({ done: [doneRow()], cantAttend: [cantAttendRow()] }), RANGE);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.kind).toBe('EXECUTED');
  });

  it('drops a CANT_ATTEND when the same inspector has a NO_SHOW_REJECTED on that appointment', () => {
    const facts = buildServiceFacts(raw({ noShow: [noShowRow()], cantAttend: [cantAttendRow()] }), RANGE);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.kind).toBe('NO_SHOW_REJECTED');
  });

  it('keeps a NO_SHOW_REJECTED and a later DONE of the same inspector (distinct events)', () => {
    const facts = buildServiceFacts(raw({ done: [doneRow()], noShow: [noShowRow()] }), RANGE);
    expect(facts.map((f) => f.kind).sort()).toEqual(['EXECUTED', 'NO_SHOW_REJECTED']);
  });

  it('keeps a CANT_ATTEND and a DONE of DIFFERENT inspectors on the same appointment', () => {
    const facts = buildServiceFacts(
      raw({
        done: [doneRow({ inspectorId: 'hugo' })],
        cantAttend: [cantAttendRow({ inspectorId: 'gil' })],
      }),
      RANGE,
    );
    expect(facts).toHaveLength(2);
  });
});

describe('buildServiceFacts — DONE typing & attribution', () => {
  it('types a DONE with no own execution as DONE_WITHOUT_EXECUTION', () => {
    const facts = buildServiceFacts(raw({ done: [doneRow({ startedAt: null, finishedAt: null })] }), RANGE);
    expect(facts[0]?.kind).toBe('DONE_WITHOUT_EXECUTION');
  });

  it('keeps a rejected DONE (own execution) as EXECUTED with doneRejected', () => {
    const facts = buildServiceFacts(
      raw({ done: [doneRow({ origin: 'REJECTED_DONE', doneRejected: true, inspectorId: 'ana' })] }),
      RANGE,
    );
    expect(facts[0]?.kind).toBe('EXECUTED');
    expect(facts[0]?.doneRejected).toBe(true);
    expect(facts[0]?.inspectorId).toBe('ana');
  });
});

describe('buildServiceFacts — late rejection (L-F07-07)', () => {
  it('marks a REJECTED_DONE whose service date is outside the period as late, using the rejection date', () => {
    const facts = buildServiceFacts(
      raw({
        done: [
          doneRow({
            origin: 'REJECTED_DONE',
            doneRejected: true,
            serviceDate: '2026-10-02',
            rejectedOn: '2026-11-05',
          }),
        ],
      }),
      RANGE,
    );
    expect(facts[0]?.lateRejection).toBe(true);
    expect(facts[0]?.serviceDate).toBe('2026-11-05');
  });

  it('keeps a REJECTED_DONE whose service date is inside the period as a normal fact', () => {
    const facts = buildServiceFacts(
      raw({ done: [doneRow({ origin: 'REJECTED_DONE', doneRejected: true, serviceDate: '2026-11-10', rejectedOn: '2026-11-12' })] }),
      RANGE,
    );
    expect(facts[0]?.lateRejection).toBe(false);
    expect(facts[0]?.serviceDate).toBe('2026-11-10');
  });
});

describe('buildServiceFacts — weight and published times from the plan stop', () => {
  const stop: ReliabilityPlanStopRow = {
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    planDate: '2026-11-10',
    travelSeconds: 90,
    durationMinutes: 60,
    publishedEta: new Date('2026-11-09T23:50:00Z'),
    publishedServiceStartAt: new Date('2026-11-09T23:50:00Z'),
  };

  it('uses the matching stop duration + travel and the published times', () => {
    const facts = buildServiceFacts(raw({ done: [doneRow()], planStops: [stop] }), RANGE);
    expect(facts[0]?.durationMinutes).toBe(60);
    expect(facts[0]?.plannedTravelMinutes).toBe(1.5);
    expect(facts[0]?.publishedEtaAt).toEqual(stop.publishedEta);
    expect(facts[0]?.publishedServiceStartAt).toEqual(stop.publishedServiceStartAt);
  });

  it('falls back to the service-type duration and no plan times without a matching stop', () => {
    const facts = buildServiceFacts(raw({ done: [doneRow()] }), RANGE);
    expect(facts[0]?.durationMinutes).toBe(45);
    expect(facts[0]?.plannedTravelMinutes).toBe(0);
    expect(facts[0]?.publishedEtaAt).toBeNull();
  });

  it('ignores a stop of another inspector for the same appointment', () => {
    const facts = buildServiceFacts(raw({ done: [doneRow()], planStops: [{ ...stop, inspectorId: 'other' }] }), RANGE);
    expect(facts[0]?.durationMinutes).toBe(45);
    expect(facts[0]?.publishedEtaAt).toBeNull();
  });
});

describe('buildServiceFacts — CANT_ATTEND effective notice & inspectorCreatedOn tz', () => {
  it('resolves cantAttendNoticeAt via resolveEffectiveEventTime (plausible client time wins)', () => {
    const client = new Date('2026-11-09T22:00:00Z');
    const facts = buildServiceFacts(
      raw({ cantAttend: [cantAttendRow({ clientOccurredAt: client, createdAt: new Date('2026-11-09T22:30:00Z') })] }),
      RANGE,
    );
    expect(facts[0]?.cantAttendNoticeAt).toEqual(client);
  });

  it('converts inspectorCreatedAt to a Sydney civil date', () => {
    const facts = buildServiceFacts(
      raw({ done: [doneRow({ inspectorCreatedAt: new Date('2026-11-18T14:00:00Z') })] }),
      RANGE,
    );
    expect(facts[0]?.inspectorCreatedOn).toBe('2026-11-19');
  });
});
