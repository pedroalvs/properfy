import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  addCivilDays,
  todayInTzDateString,
  type RouteWeightsPreview as RouteWeightsPreviewData,
  type RouteWeightsPreviewResponse,
} from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { RouteWeightsPreview } from './RouteWeightsPreview';

const TZ = 'Australia/Sydney';
vi.mock('@/hooks/useEffectiveTimezone', () => ({ useEffectiveTimezone: () => TZ }));

// Controllable InspectorSelect stub (the real combobox is covered via useInspectorSearch).
vi.mock('./InspectorSelect', () => ({
  InspectorSelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" data-testid="inspector-stub" data-value={value} onClick={() => onChange('insp-1')}>
      pick inspector
    </button>
  ),
}));

const previewFn = vi.fn();
let hookError: ApiError | null = null;
let hookLoading = false;
const resetFn = vi.fn();
vi.mock('../hooks/useRouteWeightsPreview', () => ({
  useRouteWeightsPreview: () => ({
    preview: previewFn,
    data: undefined,
    isLoading: hookLoading,
    error: hookError,
    reset: resetFn,
  }),
}));

function makePreview(partial: Partial<RouteWeightsPreviewData> = {}): RouteWeightsPreviewData {
  return {
    weights: { travel: 1, windowWait: 1, baseProximity: 1 },
    etaSource: 'MATRIX',
    approximate: false,
    departureAt: '2026-11-05T21:50:00.000Z',
    finishEta: '2026-11-05T02:40:00.000Z',
    totals: { driveS: 4200, waitS: 900, lateS: 0 },
    feasible: true,
    stops: [
      {
        appointmentId: '11111111-1111-1111-1111-111111111111',
        sequence: 1,
        appointmentCode: 'INS-0042',
        suburb: 'Surry Hills',
        windowStart: '09:00',
        windowEnd: '11:00',
        timezone: TZ,
        eta: '2026-11-04T22:05:00.000Z',
        lateS: 0,
      },
    ],
    ...partial,
  };
}

function response(current: RouteWeightsPreviewData, proposed: RouteWeightsPreviewData): RouteWeightsPreviewResponse {
  return { current, proposed };
}

const WEIGHTS = { travel: 1, windowWait: 0, baseProximity: 1 };

beforeEach(() => {
  previewFn.mockReset();
  resetFn.mockReset();
  hookError = null;
  hookLoading = false;
});

describe('RouteWeightsPreview', () => {
  it('disables Preview until an inspector is chosen', () => {
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('inspector-stub'));
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('shows the fixed note', () => {
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    expect(
      screen.getByText("Preview uses estimated travel times and doesn't change any route."),
    ).toBeInTheDocument();
  });

  it('previews tomorrow (effective tz) with the form weights and renders two columns', async () => {
    const tomorrow = addCivilDays(todayInTzDateString(TZ), 1);
    previewFn.mockResolvedValueOnce(response(makePreview(), makePreview()));
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => expect(previewFn).toHaveBeenCalledWith({ inspectorId: 'insp-1', date: tomorrow, weights: WEIGHTS }));
    await waitFor(() => expect(screen.getByText('Saved weights')).toBeInTheDocument());
    expect(screen.getByText('Weights in this form')).toBeInTheDocument();
    // Stop line + totals (times render 12h am/pm via the shared helpers).
    expect(screen.getAllByText('1. INS-0042 · Surry Hills · 9:00 am – 11:00 am · ETA 9:05 am').length).toBe(2);
    expect(screen.getAllByText(/Drive 1 h 10 min · Waiting 15 min · Finish ~1:40 pm/).length).toBe(2);
  });

  it('flags the right column when the order differs', async () => {
    const A = '11111111-1111-1111-1111-111111111111';
    const B = '22222222-2222-2222-2222-222222222222';
    const current = makePreview({
      stops: [
        { ...makePreview().stops[0]!, appointmentId: A, sequence: 1, appointmentCode: 'A' },
        { ...makePreview().stops[0]!, appointmentId: B, sequence: 2, appointmentCode: 'B' },
      ],
    });
    const proposed = makePreview({
      stops: [
        { ...makePreview().stops[0]!, appointmentId: B, sequence: 1, appointmentCode: 'B' },
        { ...makePreview().stops[0]!, appointmentId: A, sequence: 2, appointmentCode: 'A' },
      ],
    });
    previewFn.mockResolvedValueOnce(response(current, proposed));
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByText('Order changes with these weights')).toBeInTheDocument());
  });

  it('shows the approximate badge and the late chip', async () => {
    const late = makePreview({
      approximate: true,
      stops: [{ ...makePreview().stops[0]!, lateS: 1500 }],
    });
    previewFn.mockResolvedValueOnce(response(late, late));
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getAllByText('Approximate (straight-line estimate)').length).toBe(2));
    expect(screen.getAllByText('Late by 25 min').length).toBe(2);
  });

  it('shows the empty message when the inspector has no inspections', async () => {
    const empty = makePreview({ stops: [], totals: { driveS: 0, waitS: 0, lateS: 0 }, finishEta: null });
    previewFn.mockResolvedValueOnce(response(empty, empty));
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() =>
      expect(screen.getByText('This inspector has no inspections on this day.')).toBeInTheDocument(),
    );
  });

  it('shows the rate-limit message on 429', async () => {
    hookError = new ApiError(429, 'Too many requests', 'RATE_LIMIT');
    previewFn.mockRejectedValueOnce(hookError);
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByText('Too many previews. Try again in a minute.')).toBeInTheDocument());
  });

  it('shows the date-range message on a 422 on the date field', async () => {
    hookError = new ApiError(422, 'Out of range', 'DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE');
    previewFn.mockRejectedValueOnce(hookError);
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByText('Pick a day between today and 14 days ahead')).toBeInTheDocument());
  });

  it('shows a retryable ErrorState on any other error', async () => {
    hookError = new ApiError(500, 'Boom', 'INTERNAL_ERROR');
    previewFn.mockRejectedValueOnce(hookError);
    render(<RouteWeightsPreview weights={WEIGHTS} weightsValid />);
    fireEvent.click(screen.getByTestId('inspector-stub'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByText("Couldn't run the preview.")).toBeInTheDocument());
  });
});
