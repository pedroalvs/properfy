/**
 * Hours after check-in, with no check-out, at which an execution is considered
 * "stuck". Single source of truth shared by the OP/AM stuck-alert worker
 * (`notify-stuck.worker.ts`) and the F07 reliability `NO_STUCK` metric, so the
 * two can never disagree about what "stuck" means.
 */
export const STUCK_THRESHOLD_HOURS = 6;
