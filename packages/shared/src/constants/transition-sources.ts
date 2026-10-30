/**
 * Values of `metadata.source` on an `appointment.status_transition` audit (and
 * the matching domain event), identifying what triggered a transition beyond
 * the raw `actorType`. A SYSTEM transition driven by a human (e.g. the inspector
 * tapping "Can't do this job") stays `actorType: 'SYSTEM'` but carries a source
 * so consumers can attribute it.
 *
 * Read by `ReportCantDoUseCase` (which sets it) and the web `AuditTimeline`
 * (which labels it). TASK-F06-2 adds `TRANSITION_SOURCE_INSPECTOR_FINISH` here
 * for the inspector check-out. Consumers MUST match on these constants, never on
 * `actorType`.
 */
export const TRANSITION_SOURCE_INSPECTOR_CANT_DO = 'INSPECTOR_CANT_DO';
