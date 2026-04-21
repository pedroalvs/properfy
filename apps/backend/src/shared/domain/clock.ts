/**
 * Clock port.
 *
 * Use cases that compare user-supplied dates to the wall clock (past-date
 * rejection, priority expiry windows, payment grace windows, etc.) take a
 * `Clock` instead of calling `new Date()` directly. This lets tests freeze
 * time with a `FakeClock` and unblocks deterministic edge-case coverage —
 * "what happens when scheduledDate is exactly today at 23:59 UTC", "what
 * happens one second past the grace window", and so on.
 *
 * Production wires `SystemClock` in `main/container.ts`. Tests that don't
 * care about the wall clock can omit the clock (constructors default to
 * `SystemClock`) and behave exactly as before. Tests that do care pass a
 * `FakeClock` seeded with the moment they want to simulate.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
