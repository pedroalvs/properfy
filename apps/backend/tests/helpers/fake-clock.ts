import type { Clock } from '../../src/shared/domain/clock';

/**
 * A mutable clock for deterministic tests.
 *
 *     const clock = new FakeClock(new Date('2026-04-15T10:00:00Z'));
 *     const uc = new CreateAppointmentUseCase(..., clock);
 *     clock.advanceBy(24 * 60 * 60 * 1000); // 1 day
 *     clock.setNow(new Date('2026-06-01T09:00:00Z'));
 *
 * Intentionally accepts a `Date` (not a timestamp) to keep call sites
 * self-documenting.
 */
export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  setNow(date: Date): void {
    this.current = new Date(date);
  }

  advanceBy(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
