import { useMemo } from 'react';
import { formatInstantTime, formatWallTimeRange, type DayPlanResponse, type DayPlanStop } from '@properfy/shared';
import type { MarkerVariant } from '@/lib/map';

export interface RoutePin {
  appointmentId: string;
  /** Display number in the current (draft or plan) order. */
  label: string;
  variant: MarkerVariant;
  lat: number;
  lng: number;
  ariaLabel: string;
  chip: { title: string; address: string; window: string; detailHref: string };
}

export interface RoutePins {
  /** Origin marker point, or null (no base, `NONE`, or `LAST_STOP`). */
  origin: { lat: number; lng: number; ariaLabel: string } | null;
  stopPins: RoutePin[];
  /** Points for camera framing (origin + plottable stops). */
  cameraPoints: Array<{ id: string; lat: number | null; lng: number | null }>;
  /** Stops with no plottable location (shown as a note, not a pin). */
  offMapCount: number;
}

function stopVariant(stop: DayPlanStop): MarkerVariant {
  if (stop.appointmentStatus === 'DONE' || stop.executed) return 'done';
  if (stop.executionStatus === 'IN_PROGRESS') return 'group'; // filled primary = in progress
  return 'stop';
}

function plottable(stop: DayPlanStop): boolean {
  return !stop.missingCoordinates && stop.lat !== null && stop.lng !== null;
}

/**
 * Build the map's markers from the plan's stops in `displayOrder` (plan order,
 * or the local draft order while reordering). Numbers follow the display order;
 * the origin marker is omitted for `NONE` and `LAST_STOP` (the last done stop
 * already marks the continuation point, L-F04-07). Stops without a location get
 * no pin and are counted in `offMapCount`.
 *
 * `suppressEta` drops the ETA from the pin label and chip while a reorder draft
 * is dirty: the saved `stop.eta` no longer matches the draft order, and the List
 * tab is the source of truth for the local "~" ETAs.
 */
export function useRoutePins(plan: DayPlanResponse, displayOrder: string[], suppressEta = false): RoutePins {
  return useMemo(() => {
    const bySequence = [...plan.stops].sort((a, b) => a.sequence - b.sequence);
    const byId = new Map(plan.stops.map((s) => [s.appointmentId, s] as const));
    // Respect the draft order for ids present in it, then any remaining stops.
    const ordered: DayPlanStop[] = [];
    const seen = new Set<string>();
    for (const id of displayOrder) {
      const stop = byId.get(id);
      if (stop) {
        ordered.push(stop);
        seen.add(id);
      }
    }
    for (const stop of bySequence) if (!seen.has(stop.appointmentId)) ordered.push(stop);

    const stopPins: RoutePin[] = [];
    const cameraPoints: Array<{ id: string; lat: number | null; lng: number | null }> = [];
    let offMapCount = 0;

    ordered.forEach((stop, index) => {
      const label = String(index + 1);
      if (!plottable(stop)) {
        offMapCount += 1;
        return;
      }
      const eta = !suppressEta && stop.eta ? formatInstantTime(stop.eta, stop.timezone) : '';
      const etaSuffix = eta ? `, ETA ${eta}` : '';
      stopPins.push({
        appointmentId: stop.appointmentId,
        label,
        variant: stopVariant(stop),
        lat: stop.lat as number,
        lng: stop.lng as number,
        ariaLabel: `Stop ${label}, ${stop.propertyAddress}${etaSuffix}`,
        chip: {
          title: eta ? `Stop ${label} · ETA ${eta}` : `Stop ${label}`,
          address: stop.propertyAddress,
          window: formatWallTimeRange(stop.windowStart, stop.windowEnd),
          detailHref: `/schedule/${stop.appointmentId}`,
        },
      });
      cameraPoints.push({ id: stop.appointmentId, lat: stop.lat, lng: stop.lng });
    });

    const showOrigin =
      plan.origin.source !== 'NONE' &&
      plan.origin.source !== 'LAST_STOP' &&
      plan.origin.lat !== null &&
      plan.origin.lng !== null;
    const origin = showOrigin
      ? {
          lat: plan.origin.lat as number,
          lng: plan.origin.lng as number,
          ariaLabel: `Start: ${plan.origin.label ?? 'your base address'}`,
        }
      : null;
    if (origin) cameraPoints.unshift({ id: 'origin', lat: origin.lat, lng: origin.lng });

    return { origin, stopPins, cameraPoints, offMapCount };
  }, [plan, displayOrder, suppressEta]);
}
