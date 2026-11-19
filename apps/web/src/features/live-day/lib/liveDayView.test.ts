import { describe, it, expect } from 'vitest';
import type { LiveDayInspector, LiveDayStop, LiveDayAlert } from '@properfy/shared';
import {
  filterInspectors,
  routesToDraw,
  canShowAllRoutes,
  formatDelay,
  stopTimeLabel,
  sortInspectors,
  isLiveDate,
} from './liveDayView';

function alert(type: LiveDayAlert['type']): LiveDayAlert {
  return { type } as unknown as LiveDayAlert;
}

function insp(over: Partial<LiveDayInspector>): LiveDayInspector {
  return {
    inspectorId: over.inspectorId ?? 'i',
    inspectorName: over.inspectorName ?? 'X',
    alerts: over.alerts ?? [],
    needsAttention: over.needsAttention ?? (over.alerts?.length ?? 0) > 0,
    ...over,
  } as unknown as LiveDayInspector;
}

function stop(over: Partial<LiveDayStop>): LiveDayStop {
  return {
    appointmentId: 'a',
    appointmentCode: 'INS-1',
    sequence: 1,
    inPlan: true,
    agencyName: 'Agency',
    propertyAddress: '1 King St',
    suburb: 'Surry Hills',
    lat: null,
    lng: null,
    missingCoordinates: false,
    windowStart: '08:00',
    windowEnd: '17:00',
    timezone: 'Australia/Sydney',
    startedAt: null,
    finishedAt: null,
    predictedStartAt: null,
    publishedStartAt: null,
    delayMinutes: null,
    ...over,
  } as unknown as LiveDayStop;
}

describe('liveDayView selectors', () => {
  describe('filterInspectors', () => {
    it('keeps only needs-attention inspectors when the flag is on', () => {
      const list = [insp({ inspectorId: 'a', needsAttention: true }), insp({ inspectorId: 'b', needsAttention: false })];
      expect(filterInspectors(list, { needsAttention: true }).map((i) => i.inspectorId)).toEqual(['a']);
      expect(filterInspectors(list, { needsAttention: false })).toHaveLength(2);
    });
  });

  describe('routesToDraw', () => {
    const list = [insp({ inspectorId: 'J' }), insp({ inspectorId: 'T' }), insp({ inspectorId: 'K' })];

    it('draws nothing with no selection and show-all off', () => {
      expect(routesToDraw(list, { showAll: false, selectedId: null })).toEqual([]);
    });

    it('draws only the selected inspector when show-all is off', () => {
      const drawn = routesToDraw(list, { showAll: false, selectedId: 'J' });
      expect(drawn.map((d) => d.inspector.inspectorId)).toEqual(['J']);
      expect(drawn[0]!.emphasis).toBe('selected');
    });

    it('draws all visible inspectors as normal when show-all is on without a selection', () => {
      const drawn = routesToDraw(list, { showAll: true, selectedId: null });
      expect(drawn.map((d) => d.inspector.inspectorId)).toEqual(['J', 'T', 'K']);
      expect(drawn.every((d) => d.emphasis === 'normal')).toBe(true);
    });

    it('draws all with the selected emphasised and the rest muted', () => {
      const drawn = routesToDraw(list, { showAll: true, selectedId: 'J' });
      expect(drawn.find((d) => d.inspector.inspectorId === 'J')!.emphasis).toBe('selected');
      expect(drawn.filter((d) => d.inspector.inspectorId !== 'J').every((d) => d.emphasis === 'muted')).toBe(true);
    });
  });

  describe('canShowAllRoutes', () => {
    it('allows up to 40 and blocks 41', () => {
      expect(canShowAllRoutes(40)).toBe(true);
      expect(canShowAllRoutes(41)).toBe(false);
    });
  });

  describe('isLiveDate (server today)', () => {
    it('null date (today) is live', () => {
      expect(isLiveDate(null, '2026-11-05')).toBe(true);
    });
    it('assumes live before the first response (today null)', () => {
      expect(isLiveDate('2026-11-05', null)).toBe(true);
    });
    it('today and tomorrow are live; a past day is not', () => {
      expect(isLiveDate('2026-11-05', '2026-11-05')).toBe(true);
      expect(isLiveDate('2026-11-06', '2026-11-05')).toBe(true);
      expect(isLiveDate('2026-11-04', '2026-11-05')).toBe(false);
    });
  });

  describe('formatDelay', () => {
    it('formats late, on-time and unknown', () => {
      expect(formatDelay(22)).toBe('+22 min');
      expect(formatDelay(0)).toBe('On time');
      expect(formatDelay(-5)).toBe('On time');
      expect(formatDelay(null)).toBe('—');
    });
  });

  describe('stopTimeLabel', () => {
    it('DONE with start and finish → "Done 9:02 am – 9:41 am"', () => {
      expect(
        stopTimeLabel(
          stop({
            progress: 'DONE',
            startedAt: '2026-11-05T09:02:00+11:00',
            finishedAt: '2026-11-05T09:41:00+11:00',
          }),
          { isPastDay: false },
        ),
      ).toBe('Done 9:02 am – 9:41 am');
    });

    it('DONE without execution → "Done (no check-in)"', () => {
      expect(stopTimeLabel(stop({ progress: 'DONE' }), { isPastDay: false })).toBe('Done (no check-in)');
    });

    it('CURRENT with startedAt → "In progress since 10:17 am"', () => {
      expect(
        stopTimeLabel(stop({ progress: 'CURRENT', startedAt: '2026-11-05T10:17:00+11:00' }), { isPastDay: false }),
      ).toBe('In progress since 10:17 am');
    });

    it('CURRENT without startedAt → "Next · ETA 10:40 am"', () => {
      expect(
        stopTimeLabel(stop({ progress: 'CURRENT', predictedStartAt: '2026-11-05T10:40:00+11:00' }), { isPastDay: false }),
      ).toBe('Next · ETA 10:40 am');
    });

    it('OPEN → "Started 9:00 am · not checked out"', () => {
      expect(
        stopTimeLabel(stop({ progress: 'OPEN', startedAt: '2026-11-05T09:00:00+11:00' }), { isPastDay: false }),
      ).toBe('Started 9:00 am · not checked out');
    });

    it('REMAINING in plan → "ETA 11:15 am"', () => {
      expect(
        stopTimeLabel(stop({ progress: 'REMAINING', predictedStartAt: '2026-11-05T11:15:00+11:00' }), { isPastDay: false }),
      ).toBe('ETA 11:15 am');
    });

    it('REMAINING out of plan → "Window 1:00 pm – 3:00 pm"', () => {
      expect(
        stopTimeLabel(stop({ progress: 'REMAINING', inPlan: false, windowStart: '13:00', windowEnd: '15:00' }), {
          isPastDay: false,
        }),
      ).toBe('Window 1:00 pm – 3:00 pm');
    });

    it('REMAINING on a past day → "Planned 11:15 am" (no projection, L-F05-02)', () => {
      expect(
        stopTimeLabel(stop({ progress: 'REMAINING', predictedStartAt: '2026-11-05T11:15:00+11:00' }), { isPastDay: true }),
      ).toBe('Planned 11:15 am');
    });

    it('formats in the stop timezone (Perth shows 8:00 am local)', () => {
      expect(
        stopTimeLabel(
          stop({
            progress: 'DONE',
            timezone: 'Australia/Perth',
            startedAt: '2026-11-05T00:00:00Z',
            finishedAt: '2026-11-05T00:30:00Z',
          }),
          { isPastDay: false },
        ),
      ).toBe('Done 8:00 am – 8:30 am');
    });
  });

  describe('sortInspectors', () => {
    it('orders by most-severe alert rank, then name (en-AU)', () => {
      const ana = insp({ inspectorId: 'ana', inspectorName: 'Ana', alerts: [] });
      const bob = insp({ inspectorId: 'bob', inspectorName: 'Bob', alerts: [alert('NOT_STARTED')] });
      const carl = insp({ inspectorId: 'carl', inspectorName: 'Carl', alerts: [alert('CANT_DO')] });
      const dan = insp({ inspectorId: 'dan', inspectorName: 'Dan', alerts: [alert('NOT_STARTED')] });
      expect(sortInspectors([ana, bob, carl, dan]).map((i) => i.inspectorName)).toEqual(['Carl', 'Bob', 'Dan', 'Ana']);
    });

    it('uses the most severe alert when an inspector has several', () => {
      const a = insp({ inspectorId: 'a', inspectorName: 'Zed', alerts: [alert('DELAY'), alert('CANT_DO')] });
      const b = insp({ inspectorId: 'b', inspectorName: 'Amy', alerts: [alert('NOT_STARTED')] });
      // Zed's best rank is CANT_DO (0) → ahead of Amy's NOT_STARTED, despite the name.
      expect(sortInspectors([b, a]).map((i) => i.inspectorName)).toEqual(['Zed', 'Amy']);
    });
  });
});
