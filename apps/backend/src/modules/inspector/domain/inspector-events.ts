/**
 * Inspector domain events (F01-1).
 *
 * `BASE_CHANGED` is emitted after a base-address write by create, the OP update,
 * the inspector self-update and the backfill — only when the base was actually
 * stored or changed (never on a "same address" no-op). It has no subscriber in
 * F01; F04 decides what a published `DayPlan` does with a base change. Emitted on
 * the shared `DomainEventBus`; a throwing subscriber must not fail the response.
 */
export const INSPECTOR_EVENTS = {
  BASE_CHANGED: 'inspector.base_changed',
} as const;

export interface InspectorBaseChangedPayload {
  inspectorId: string;
  hadCoordinates: boolean;
  hasCoordinates: boolean;
}
