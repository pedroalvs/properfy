import { describe, it, expect } from 'vitest';
import { deriveInspectorState } from './derive-inspector-state';
import { makeStopRow } from './live-day-test-factories';
import type { LiveDayStopRow } from './live-day.read-repository';

let seq = 0;
const id = () => `app-${(seq++).toString().padStart(2, '0')}`;
const notStarted = (): LiveDayStopRow =>
  makeStopRow({ appointmentId: id(), status: 'SCHEDULED', startedAt: null, finishedAt: null, abandonedAt: null });
const inProgress = (startedAt = '2026-11-05T09:00:00Z'): LiveDayStopRow =>
  makeStopRow({ appointmentId: id(), status: 'SCHEDULED', startedAt, finishedAt: null, abandonedAt: null });
const finishedViaExec = (): LiveDayStopRow =>
  makeStopRow({ appointmentId: id(), status: 'SCHEDULED', startedAt: '2026-11-05T09:00:00Z', finishedAt: '2026-11-05T09:40:00Z', abandonedAt: null });
const doneNoExec = (): LiveDayStopRow =>
  makeStopRow({ appointmentId: id(), status: 'DONE', startedAt: null, finishedAt: null, abandonedAt: null });
const abandoned = (): LiveDayStopRow =>
  makeStopRow({ appointmentId: id(), status: 'SCHEDULED', startedAt: '2026-11-05T08:20:00Z', finishedAt: null, abandonedAt: '2026-11-05T08:30:00Z' });

describe('deriveInspectorState (§2 truth table, test 1)', () => {
  it('1. A,B,C not started -> NOT_STARTED', () => {
    expect(deriveInspectorState([notStarted(), notStarted(), notStarted()]).state).toBe('NOT_STARTED');
  });
  it('2. A in progress; B,C not started -> AT_PROPERTY (01.A4 after check-in)', () => {
    expect(deriveInspectorState([inProgress(), notStarted(), notStarted()]).state).toBe('AT_PROPERTY');
  });
  it('3. A finished; B,C not started -> IN_TRANSIT (01.A4 after check-out, stops remain)', () => {
    expect(deriveInspectorState([finishedViaExec(), notStarted(), notStarted()]).state).toBe('IN_TRANSIT');
  });
  it('4. A finished; B in progress; C not started -> AT_PROPERTY', () => {
    expect(deriveInspectorState([finishedViaExec(), inProgress(), notStarted()]).state).toBe('AT_PROPERTY');
  });
  it('5. A,B,C finished -> DONE_FOR_DAY (01.A4 after final check-out)', () => {
    const r = deriveInspectorState([finishedViaExec(), finishedViaExec(), finishedViaExec()]);
    expect(r.state).toBe('DONE_FOR_DAY');
    expect(r.progress).toEqual({ done: 3, inProgress: 0, remaining: 0, total: 3 });
  });
  it('6. A,B finished; C in progress -> AT_PROPERTY', () => {
    expect(deriveInspectorState([finishedViaExec(), finishedViaExec(), inProgress()]).state).toBe('AT_PROPERTY');
  });
  it('7. A DONE without execution; B not started -> IN_TRANSIT', () => {
    const r = deriveInspectorState([doneNoExec(), notStarted()]);
    expect(r.state).toBe('IN_TRANSIT');
    expect(r.progress).toEqual({ done: 1, inProgress: 0, remaining: 1, total: 2 });
  });
  it('8. A abandoned (still assigned); B not started -> NOT_STARTED', () => {
    const r = deriveInspectorState([abandoned(), notStarted()]);
    expect(r.state).toBe('NOT_STARTED');
    expect(r.progress).toEqual({ done: 0, inProgress: 0, remaining: 2, total: 2 });
  });
  it('9. A,B in progress (forgotten check-out) -> AT_PROPERTY', () => {
    expect(deriveInspectorState([inProgress('2026-11-05T09:00:00Z'), inProgress('2026-11-05T10:00:00Z')]).state).toBe('AT_PROPERTY');
  });
  it('10. no live stops (CANT_DO roster entry only) -> DONE_FOR_DAY', () => {
    const r = deriveInspectorState([]);
    expect(r.state).toBe('DONE_FOR_DAY');
    expect(r.progress).toEqual({ done: 0, inProgress: 0, remaining: 0, total: 0 });
  });
  it('11. B finished, A not started -> IN_TRANSIT', () => {
    expect(deriveInspectorState([notStarted(), finishedViaExec()]).state).toBe('IN_TRANSIT');
  });
  it('12. 4 not started (tomorrow) -> NOT_STARTED', () => {
    expect(deriveInspectorState([notStarted(), notStarted(), notStarted(), notStarted()]).state).toBe('NOT_STARTED');
  });
  it('13. single stop in progress -> AT_PROPERTY', () => {
    expect(deriveInspectorState([inProgress()]).state).toBe('AT_PROPERTY');
  });
  it('14. single stop finished -> DONE_FOR_DAY', () => {
    expect(deriveInspectorState([finishedViaExec()]).state).toBe('DONE_FOR_DAY');
  });
});
