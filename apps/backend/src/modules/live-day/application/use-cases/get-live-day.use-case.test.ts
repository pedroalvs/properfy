import { describe, it, expect, vi } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { DEFAULT_LIVE_DAY_ALERTS, liveDayResponseSchema } from '@properfy/shared';
import { GetLiveDayUseCase } from './get-live-day.use-case';
import { makeInspectorRow, makeStopRow } from '../../domain/live-day-test-factories';
import type {
  ILiveDayReadRepository,
  LiveDayInspectorRow,
} from '../../domain/live-day.read-repository';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';

// Sydney is UTC+11 (AEDT) in November → 2026-11-05T02:00Z is 13:00 civil 2026-11-05.
const FIXED = new Date('2026-11-05T02:00:00.000Z');
const clock = { now: () => FIXED };

const FIELD_EVENTS = {
  geofenceRadiusMeters: 300,
  checkInWindowToleranceMinutes: 15,
  completionReminderMinutesAfterWindowEnd: 30,
};
const settings: IPlatformSettingsReader = {
  get: vi.fn(async (key: string) =>
    key === 'fieldEvents' ? FIELD_EVENTS : { ...DEFAULT_LIVE_DAY_ALERTS },
  ),
} as unknown as IPlatformSettingsReader;

function actor(role: UserRole): AuthContext {
  return {
    userId: 'u-1',
    tenantId: role.startsWith('CL') ? 't-1' : null,
    role,
    branchId: null,
    inspectorId: role === 'INSP' ? 'i-1' : null,
    timezone: 'Australia/Sydney',
  };
}

function repoWith(rows: LiveDayInspectorRow[]): ILiveDayReadRepository {
  return {
    getDay: vi.fn().mockResolvedValue(rows),
    getLockedTime: vi.fn(),
  };
}

function useCase(rows: LiveDayInspectorRow[] = []): GetLiveDayUseCase {
  return new GetLiveDayUseCase(repoWith(rows), settings, clock);
}

// Seeds chosen so no alert fires (this stays a pure roll-up test; alert behaviour is
// covered by derive-alerts.test.ts): on-time starts and a future not-started window.
/** One finished stop (started + finished, not abandoned). */
const finishedStop = (appointmentId: string) =>
  makeStopRow({
    appointmentId,
    publishedServiceStartAt: '2026-11-04T22:00:00.000Z',
    startedAt: '2026-11-04T22:00:00.000Z',
    finishedAt: '2026-11-04T22:40:00.000Z',
  });
/** One in-progress stop (started roughly on time, not finished). */
const inProgressStop = (appointmentId: string) =>
  makeStopRow({
    appointmentId,
    publishedServiceStartAt: '2026-11-04T22:55:00.000Z',
    startedAt: '2026-11-04T23:00:00.000Z',
    finishedAt: null,
  });
/** One not-started stop whose window is still ahead of the fixed clock. */
const notStartedStop = (appointmentId: string) =>
  makeStopRow({
    appointmentId,
    publishedServiceStartAt: '2026-11-05T05:00:00.000Z',
    windowStartAt: '2026-11-05T05:00:00.000Z',
    startedAt: null,
    finishedAt: null,
  });

describe('GetLiveDayUseCase (test 10 subset: RBAC, date, summary, envelope)', () => {
  describe('RBAC — AM/OP only', () => {
    it.each(['CL_ADMIN', 'CL_USER', 'INSP', 'TNT'] as const)('rejects %s with ForbiddenError', async (role) => {
      await expect(useCase().execute({ actor: actor(role), query: { includeGeometry: 'none' } })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it.each(['AM', 'OP'] as const)('allows %s', async (role) => {
      const { response } = await useCase().execute({ actor: actor(role), query: { includeGeometry: 'none' } });
      expect(response.inspectors).toEqual([]);
    });
  });

  describe('date default + guard', () => {
    it('defaults date to the actor civil today and marks isToday', async () => {
      const { response } = await useCase().execute({ actor: actor('AM'), query: { includeGeometry: 'none' } });
      expect(response.date).toBe('2026-11-05');
      expect(response.today).toBe('2026-11-05');
      expect(response.isToday).toBe(true);
      expect(response.timezone).toBe('Australia/Sydney');
      expect(response.generatedAt).toBe(FIXED.toISOString());
    });

    it('accepts tomorrow', async () => {
      const { response } = await useCase().execute({
        actor: actor('AM'),
        query: { includeGeometry: 'none', date: '2026-11-06' },
      });
      expect(response.date).toBe('2026-11-06');
      expect(response.isToday).toBe(false);
    });

    it('accepts a past date (isToday false)', async () => {
      const { response } = await useCase().execute({
        actor: actor('AM'),
        query: { includeGeometry: 'none', date: '2026-11-01' },
      });
      expect(response.isToday).toBe(false);
    });

    it('rejects a date after tomorrow with LIVE_DAY_DATE_TOO_FAR', async () => {
      await expect(
        useCase().execute({ actor: actor('AM'), query: { includeGeometry: 'none', date: '2026-11-07' } }),
      ).rejects.toMatchObject({ code: 'LIVE_DAY_DATE_TOO_FAR' });
      await expect(
        useCase().execute({ actor: actor('AM'), query: { includeGeometry: 'none', date: '2026-11-07' } }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('assembly + summary', () => {
    const rows = [
      makeInspectorRow({
        inspectorId: '00000000-0000-4000-8000-00000000000b',
        inspectorName: 'Bob',
        stops: [inProgressStop('00000000-0000-4000-8000-0000000000b1')],
      }),
      makeInspectorRow({
        inspectorId: '00000000-0000-4000-8000-00000000000a',
        inspectorName: 'Ana',
        stops: [
          finishedStop('00000000-0000-4000-8000-0000000000a1'),
          finishedStop('00000000-0000-4000-8000-0000000000a2'),
        ],
      }),
      makeInspectorRow({
        inspectorId: '00000000-0000-4000-8000-00000000000c',
        inspectorName: 'Cara',
        stops: [
          notStartedStop('00000000-0000-4000-8000-0000000000c1'),
          notStartedStop('00000000-0000-4000-8000-0000000000c2'),
        ],
      }),
    ];

    it('sorts inspectors by name and derives each state', async () => {
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      expect(response.inspectors.map((i) => i.inspectorName)).toEqual(['Ana', 'Bob', 'Cara']);
      expect(response.inspectors.map((i) => i.state)).toEqual(['DONE_FOR_DAY', 'AT_PROPERTY', 'NOT_STARTED']);
    });

    it('rolls up the summary counts', async () => {
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      expect(response.summary).toEqual({
        inspectors: 3,
        notStarted: 1,
        atProperty: 1,
        inTransit: 0,
        doneForDay: 1,
        needsAttention: 0,
        stopsDone: 2,
        stopsTotal: 5,
      });
    });

    it('exposes the platform threshold defaults', async () => {
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      expect(response.thresholdsDefault).toEqual({ delayMinutes: 20, notStartedMinutes: 30 });
      expect(response.inspectors[0]!.thresholds).toEqual({
        delayMinutes: 20,
        delaySource: 'PLATFORM',
        notStartedMinutes: 30,
        notStartedSource: 'PLATFORM',
      });
    });

    it('the geometry poll default carries no route (none) but routeApproximate is still true', async () => {
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      for (const i of response.inspectors) {
        expect(i.geometryIncluded).toBe(false);
        expect(i.geometry).toBeNull();
        expect(i.routeApproximate).toBe(true);
      }
    });

    it('produces a body that validates against the response schema (serializer never throws)', async () => {
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      expect(() => liveDayResponseSchema.parse(response)).not.toThrow();
    });
  });

  describe('geometry modes (T039)', () => {
    const rows = [
      makeInspectorRow({
        inspectorId: '00000000-0000-4000-8000-00000000000a',
        inspectorName: 'Ana',
        originSource: 'BASE',
        originLat: -33.87,
        originLng: 151.2,
        stops: [
          notStartedStop('00000000-0000-4000-8000-0000000000a1'),
          notStartedStop('00000000-0000-4000-8000-0000000000a2'),
        ],
      }),
      makeInspectorRow({
        inspectorId: '00000000-0000-4000-8000-00000000000b',
        inspectorName: 'Bob',
        originSource: 'BASE',
        originLat: -33.87,
        originLng: 151.2,
        stops: [notStartedStop('00000000-0000-4000-8000-0000000000b1'), notStartedStop('00000000-0000-4000-8000-0000000000b2')],
      }),
    ];

    it('selected includes geometry only for the chosen inspector', async () => {
      const { response } = await useCase(rows).execute({
        actor: actor('OP'),
        query: { includeGeometry: 'selected', inspectorId: '00000000-0000-4000-8000-00000000000a' },
      });
      const ana = response.inspectors.find((i) => i.inspectorName === 'Ana')!;
      const bob = response.inspectors.find((i) => i.inspectorName === 'Bob')!;
      expect(ana.geometryIncluded).toBe(true);
      expect(ana.geometry).not.toBeNull();
      expect(bob.geometryIncluded).toBe(false);
      expect(bob.geometry).toBeNull();
    });

    it('all includes geometry for every inspector', async () => {
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'all' } });
      for (const i of response.inspectors) {
        expect(i.geometryIncluded).toBe(true);
        expect(i.geometry).not.toBeNull();
      }
    });

    it('selected without inspectorId -> LIVE_DAY_INSPECTOR_REQUIRED', async () => {
      await expect(
        useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'selected' } }),
      ).rejects.toMatchObject({ code: 'LIVE_DAY_INSPECTOR_REQUIRED' });
    });

    it('all over the 60 roster cap -> LIVE_DAY_TOO_MANY_ROUTES; none/selected uncapped', async () => {
      const many = Array.from({ length: 61 }, (_v, n) =>
        makeInspectorRow({
          inspectorId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
          inspectorName: `I${String(n).padStart(3, '0')}`,
          stops: [notStartedStop(`00000000-0000-4000-8000-1${String(n).padStart(11, '0')}`)],
        }),
      );
      await expect(
        useCase(many).execute({ actor: actor('OP'), query: { includeGeometry: 'all' } }),
      ).rejects.toMatchObject({ code: 'LIVE_DAY_TOO_MANY_ROUTES' });
      // none is uncapped
      const { response } = await useCase(many).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      expect(response.inspectors).toHaveLength(61);
    });
  });

  describe('route feasibility indicator (not an alert)', () => {
    it('exposes routeFeasible and routeViolations from the plan, never an alert', async () => {
      const rows = [
        makeInspectorRow({
          inspectorId: '00000000-0000-4000-8000-00000000000a',
          inspectorName: 'Ana',
          feasible: false,
          stops: [
            notStartedStop('00000000-0000-4000-8000-0000000000a1'),
            makeStopRow({
              appointmentId: '00000000-0000-4000-8000-0000000000a2',
              sequence: 2,
              lateS: 300,
              startedAt: null,
              publishedServiceStartAt: '2026-11-05T05:00:00.000Z',
              windowStartAt: '2026-11-05T05:00:00.000Z',
            }),
          ],
        }),
      ];
      const { response } = await useCase(rows).execute({ actor: actor('OP'), query: { includeGeometry: 'none' } });
      const ana = response.inspectors[0]!;
      expect(ana.routeFeasible).toBe(false);
      expect(ana.routeViolations).toEqual([
        { appointmentId: '00000000-0000-4000-8000-0000000000a2', appointmentCode: 'RWS-0042', sequence: 2, lateMinutes: 5 },
      ]);
      expect(ana.alerts.map((x) => x.type)).not.toContain('ROUTE_INFEASIBLE');
    });
  });
});
