import { RELIABILITY_TRAVEL_FACTOR } from '@properfy/shared';

/**
 * Weight of one service for the weighted metric rates (03.5, P7):
 * `durationMinutes + RELIABILITY_TRAVEL_FACTOR × plannedTravelMinutes`.
 *
 * Duration is the service type's / plan stop's duration; planned travel is the
 * plan stop's `travel_s / 60` (0 without a stop). Not rounded — fractional
 * travel minutes are kept. Always ≥ the 5-minute minimum duration, so no rate
 * ever divides by zero.
 */
export function serviceWeightMinutes(input: {
  durationMinutes: number;
  plannedTravelMinutes: number;
}): number {
  return input.durationMinutes + RELIABILITY_TRAVEL_FACTOR * input.plannedTravelMinutes;
}
