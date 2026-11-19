import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addCivilDays,
  formatInstantTime,
  formatWallTimeRange,
  todayInTzDateString,
  type RouteWeightsPreview as RouteWeightsPreviewData,
  type RouteWeightsPreviewResponse,
  type RouteWeightsSetting,
} from '@properfy/shared';
import { FormField } from '@/components/forms/FormField';
import { DateInput } from '@/components/forms/DateInput';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { InspectorSelect } from './InspectorSelect';
import { useRouteWeightsPreview } from '../hooks/useRouteWeightsPreview';

const PREVIEW_WINDOW_DAYS = 14;
const DATE_FIELD_ID = 'route-weights-preview-date';
const DATE_OUT_OF_RANGE_MESSAGE = 'Pick a day between today and 14 days ahead';
const RATE_LIMIT_MESSAGE = 'Too many previews. Try again in a minute.';
const FIXED_NOTE = "Preview uses estimated travel times and doesn't change any route.";
const EMPTY_MESSAGE = 'This inspector has no inspections on this day.';

/** "1 h 10 min", "15 min", "0 min" from whole seconds. */
function formatDurationFromSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours} h ${rest} min`;
  if (hours > 0) return `${hours} h`;
  return `${rest} min`;
}

function stopLine(
  stop: RouteWeightsPreviewData['stops'][number],
): string {
  const window = formatWallTimeRange(stop.windowStart, stop.windowEnd);
  const eta = formatInstantTime(stop.eta, stop.timezone);
  return `${stop.sequence}. ${stop.appointmentCode} · ${stop.suburb} · ${window} · ETA ${eta}`;
}

function sameOrder(a: RouteWeightsPreviewData, b: RouteWeightsPreviewData): boolean {
  if (a.stops.length !== b.stops.length) return false;
  return a.stops.every((s, i) => s.appointmentId === b.stops[i]!.appointmentId);
}

interface PreviewColumnProps {
  title: string;
  preview: RouteWeightsPreviewData;
  effectiveTimezone: string;
  /** Highlight + "Order changes with these weights" annotation. */
  orderChanged?: boolean;
}

function PreviewColumn({ title, preview, effectiveTimezone, orderChanged }: PreviewColumnProps) {
  const totals = preview.totals;
  const finish = preview.finishEta ? `~${formatInstantTime(preview.finishEta, effectiveTimezone)}` : '—';
  return (
    <div className={orderChanged ? 'rounded border-2 border-primary/40 p-3' : 'rounded border border-black/10 p-3'}>
      <div className="mb-2 flex items-center gap-2">
        <h5 className="text-sm font-semibold text-text-secondary">{title}</h5>
        {preview.approximate && (
          <span className="inline-block rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
            Approximate (straight-line estimate)
          </span>
        )}
      </div>
      {orderChanged && <p className="mb-2 text-xs font-semibold text-primary">Order changes with these weights</p>}
      <ol className="flex flex-col gap-1">
        {preview.stops.map((stop) => (
          <li key={stop.appointmentId} className="flex items-center justify-between gap-2 text-sm text-text-primary">
            <span>{stopLine(stop)}</span>
            {stop.lateS > 0 && (
              <span className="shrink-0 rounded bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
                Late by {Math.max(1, Math.round(stop.lateS / 60))} min
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-text-muted">
        Drive {formatDurationFromSeconds(totals.driveS)} · Waiting {formatDurationFromSeconds(totals.waitS)} · Finish{' '}
        {finish}
      </p>
    </div>
  );
}

interface RouteWeightsPreviewProps {
  /** The weights currently in the form (saved or not) — sent as `proposed`. */
  weights: RouteWeightsSetting;
  /** False while the form weights are invalid; disables Preview. */
  weightsValid: boolean;
}

/**
 * "Preview on a real day" block: runs `POST /v1/day-plans/preview` with the
 * form's weights against a chosen inspector + date and shows the saved order
 * beside the order the form's weights would produce.
 */
export function RouteWeightsPreview({ weights, weightsValid }: RouteWeightsPreviewProps) {
  const effectiveTimezone = useEffectiveTimezone();
  const today = useMemo(() => todayInTzDateString(effectiveTimezone), [effectiveTimezone]);
  const maxDate = useMemo(() => addCivilDays(today, PREVIEW_WINDOW_DAYS), [today]);
  const defaultDate = useMemo(() => addCivilDays(today, 1), [today]);

  const [inspectorId, setInspectorId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [result, setResult] = useState<RouteWeightsPreviewResponse | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { preview, isLoading, error, reset } = useRouteWeightsPreview();

  // Clear a shown result once the inputs that produced it change, so the
  // "Weights in this form" column never shows a stale order under live inputs.
  // Keyed on the weight VALUES (the prop is a fresh object each parent render,
  // so keying on its identity would wipe the result on every render).
  useEffect(() => {
    setResult(null);
    reset();
  }, [weights.travel, weights.windowWait, weights.baseProximity, inspectorId, date, reset]);

  const dateOutOfRange = error?.code === 'DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE';
  const rateLimited = error?.status === 429;
  const dateError = dateOutOfRange ? DATE_OUT_OF_RANGE_MESSAGE : undefined;

  const canPreview = !!inspectorId && weightsValid && !isLoading;

  const handlePreview = async () => {
    reset();
    setResult(null);
    try {
      const data = await preview({ inspectorId, date, weights });
      setResult(data);
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch {
      // Error is surfaced through the hook's `error`; nothing else to do here.
    }
  };

  const hasStops = !!result && (result.current.stops.length > 0 || result.proposed.stops.length > 0);
  const orderChanged = !!result && !sameOrder(result.current, result.proposed);

  return (
    <div className="mt-6 border-t border-black/10 pt-6">
      <h4 className="mb-1 text-sm font-bold uppercase tracking-wide text-text-secondary">Preview on a real day</h4>
      <p className="mb-4 text-xs text-text-muted">{FIXED_NOTE}</p>

      <div className="flex max-w-xl flex-col gap-4 sm:flex-row sm:items-end">
        <FormField label="Inspector" className="flex-1">
          <InspectorSelect value={inspectorId} onChange={setInspectorId} aria-label="Inspector" />
        </FormField>
        <FormField label="Date" htmlFor={DATE_FIELD_ID} error={dateError} className="flex-1">
          <DateInput
            id={DATE_FIELD_ID}
            value={date}
            onChange={setDate}
            min={today}
            max={maxDate}
            error={!!dateError}
            aria-label="Date"
          />
        </FormField>
        <Button variant="primary" onClick={handlePreview} loading={isLoading} disabled={!canPreview}>
          Preview
        </Button>
      </div>

      <div className="mt-4" aria-live="polite">
        {isLoading ? (
          <LoadingState rows={3} variant="card" />
        ) : rateLimited ? (
          <p className="text-sm text-error">{RATE_LIMIT_MESSAGE}</p>
        ) : error && !dateOutOfRange ? (
          <ErrorState message="Couldn't run the preview." onRetry={handlePreview} />
        ) : result ? (
          <>
            <h5 ref={headingRef} tabIndex={-1} className="mb-3 text-sm font-semibold text-text-secondary">
              Preview result
            </h5>
            {hasStops ? (
              <div className="grid gap-4 md:grid-cols-2">
                <PreviewColumn title="Saved weights" preview={result.current} effectiveTimezone={effectiveTimezone} />
                <PreviewColumn
                  title="Weights in this form"
                  preview={result.proposed}
                  effectiveTimezone={effectiveTimezone}
                  orderChanged={orderChanged}
                />
              </div>
            ) : (
              <p className="text-sm text-text-muted">{EMPTY_MESSAGE}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
