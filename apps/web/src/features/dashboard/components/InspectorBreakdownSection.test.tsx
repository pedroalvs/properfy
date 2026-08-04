import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorBreakdownSection } from './InspectorBreakdownSection';
import type { InspectorBreakdowns } from '../types';

function makeBreakdowns(overrides: Partial<InspectorBreakdowns> = {}): InspectorBreakdowns {
  return {
    tomorrowByInspector: [
      { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 18, alertLevel: 'red' },
      { inspectorId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22', inspectorName: 'Bob', count: 15, alertLevel: 'yellow' },
      { inspectorId: 'c2ccde11-1b2d-4ef0-dd8f-8dd1df502c33', inspectorName: 'Charlie', count: 3, alertLevel: null },
    ],
    scheduledThisWeekByInspector: [
      { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 25, alertLevel: null },
    ],
    confirmedThisWeekByInspector: [
      { inspectorId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22', inspectorName: 'Bob', count: 12, alertLevel: null },
    ],
    ...overrides,
  };
}

describe('InspectorBreakdownSection', () => {
  const tomorrowLabel = 'Tomorrow — Mon 25 May';

  // ─── Card titles ──────────────────────────────────────────────────────────

  it('renders all three card titles', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    expect(screen.getByText(tomorrowLabel)).toBeInTheDocument();
    expect(screen.getByText("Scheduled This Week")).toBeInTheDocument();
    expect(screen.getByText("Confirmed This Week")).toBeInTheDocument();
  });

  // ─── Inspector rows ───────────────────────────────────────────────────────

  it('renders inspector names and counts for the tomorrow list', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    // Alice appears in tomorrow + scheduled; Bob in tomorrow + confirmed; Charlie only in tomorrow
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('applies bg-error and text-error classes for alertLevel=red', () => {
    const { container } = render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const redDot = container.querySelector('.bg-error');
    expect(redDot).not.toBeNull();
    const redCount = container.querySelector('.text-error');
    expect(redCount).not.toBeNull();
  });

  it('applies bg-warning and text-warning classes for alertLevel=yellow', () => {
    const { container } = render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const yellowDot = container.querySelector('.bg-warning');
    expect(yellowDot).not.toBeNull();
    const yellowCount = container.querySelector('.text-warning');
    expect(yellowCount).not.toBeNull();
  });

  it('applies bg-gray-300 and text-text-primary for alertLevel=null', () => {
    const { container } = render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const grayDot = container.querySelector('.bg-gray-300');
    expect(grayDot).not.toBeNull();
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  it('renders "No inspections" when tomorrowByInspector is empty', () => {
    render(
      <InspectorBreakdownSection
        breakdowns={makeBreakdowns({ tomorrowByInspector: [] })}
        tomorrowLabel={tomorrowLabel}
      />,
    );

    // At least one "No inspections" text should be present
    const emptyTexts = screen.getAllByText('No inspections');
    expect(emptyTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "No inspections" when scheduledThisWeekByInspector is empty', () => {
    render(
      <InspectorBreakdownSection
        breakdowns={makeBreakdowns({ scheduledThisWeekByInspector: [] })}
        tomorrowLabel={tomorrowLabel}
      />,
    );

    const emptyTexts = screen.getAllByText('No inspections');
    expect(emptyTexts.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Threshold legend ─────────────────────────────────────────────────────

  /**
   * These assertions check the legend's TEXT, not just its presence. The old
   * test asserted presence only, which is how the legend came to advertise the
   * weekly numbers (≥15 / ≥18) as "inspections/day" without any test noticing.
   */
  it('gives every card a legend, not just the Tomorrow one', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    expect(screen.getAllByTestId('breakdown-legend')).toHaveLength(3);
  });

  it('states the DAILY thresholds on the Tomorrow card', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const legends = screen.getAllByTestId('breakdown-legend');
    expect(legends[0]).toHaveTextContent('Busy ≥3');
    expect(legends[0]).toHaveTextContent('Overloaded ≥4');
    expect(legends[0]).toHaveTextContent('that day');
  });

  it('states the WEEKLY thresholds on both week cards', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const legends = screen.getAllByTestId('breakdown-legend');
    for (const legend of legends.slice(1)) {
      expect(legend).toHaveTextContent('Busy ≥15');
      expect(legend).toHaveTextContent('Overloaded ≥18');
      expect(legend).toHaveTextContent('that week');
    }
  });

  it('never advertises the weekly numbers as a daily rate', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    expect(screen.getAllByTestId('breakdown-legend')[0]).not.toHaveTextContent('15');
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('carries the level as a word, so colour is never the only signal', () => {
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    // Fixtures: Alice 18/red, Bob 15/yellow, Charlie 3/null.
    expect(screen.getByLabelText(/Alice .* 18 inspections, Overloaded/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bob .* 15 inspections, Busy/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Charlie .* 3 inspections, Normal/)).toBeInTheDocument();
  });

  it('hides the decorative dot from assistive technology', () => {
    const { container } = render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const dots = container.querySelectorAll('li > span > span.rounded-full');
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot).toHaveAttribute('aria-hidden', 'true');
    }
  });

  // ─── Weekly cards carry a signal ──────────────────────────────────────────

  /**
   * The two weekly cards used to receive `alertLevel: null` for every row and
   * rendered a uniform grey column — indistinguishable from a genuinely normal
   * inspector, and the weekly 15/18 threshold appeared nowhere on the dashboard.
   */
  it('colours an over-capacity row in the weekly cards', () => {
    render(
      <InspectorBreakdownSection
        breakdowns={makeBreakdowns({
          scheduledThisWeekByInspector: [
            { inspectorId: 'w-1', inspectorName: 'Wendy', count: 20, alertLevel: 'red' },
          ],
        })}
        tomorrowLabel={tomorrowLabel}
      />,
    );

    expect(screen.getByLabelText(/Wendy .* 20 inspections, Overloaded/)).toBeInTheDocument();
  });

  // ─── tomorrowLabel prop ───────────────────────────────────────────────────

  it('tomorrowLabel appears in the Tomorrow card header', () => {
    const customLabel = 'Tomorrow — Fri 29 May';
    render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={customLabel} />,
    );

    expect(screen.getByText(customLabel)).toBeInTheDocument();
  });

  // ─── Layout ───────────────────────────────────────────────────────────────

  it('root element has grid lg:grid-cols-3 layout', () => {
    const { container } = render(
      <InspectorBreakdownSection breakdowns={makeBreakdowns()} tomorrowLabel={tomorrowLabel} />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('grid');
    expect(root.className).toContain('lg:grid-cols-3');
    expect(root.className).toContain('gap-4');
  });
});
