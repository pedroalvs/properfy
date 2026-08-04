import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { ServiceTypeDistribution } from './ServiceTypeDistribution';
import { CATEGORICAL_SERIES } from './charts/theme';

type Distribution = DashboardAnalyticsResponse['serviceTypeDistribution'];

const entry = (code: string, name: string, count: number, id = code): Distribution[number] => ({
  serviceTypeId: `id-${id}`,
  code,
  name,
  count,
});

function swatchColors(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('li span[aria-hidden="true"]')].map(
    (node) => node.style.backgroundColor,
  );
}

describe('ServiceTypeDistribution', () => {
  it('lists each service type with its count and share', () => {
    render(
      <ServiceTypeDistribution
        distribution={[entry('ROUTINE', 'Routine Inspection', 75), entry('INGOING', 'Ingoing Inspection', 25)]}
      />,
    );
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getByText('75 · 75%')).toBeInTheDocument();
    expect(screen.getByText('25 · 25%')).toBeInTheDocument();
  });

  it('keeps a service type on its own colour when the ranking changes', () => {
    // Colour must follow the entity, never its rank — otherwise changing the
    // period silently repaints the survivors and the reader mis-reads the chart.
    const first = render(
      <ServiceTypeDistribution
        distribution={[entry('INGOING', 'Ingoing Inspection', 80), entry('ROUTINE', 'Routine Inspection', 20)]}
      />,
    );
    const ingoingColorWhenLeading = swatchColors(first.container)[0];
    first.unmount();

    const second = render(
      <ServiceTypeDistribution
        distribution={[entry('INGOING', 'Ingoing Inspection', 10), entry('ROUTINE', 'Routine Inspection', 90)]}
      />,
    );
    const rows = [...second.container.querySelectorAll('li')];
    const ingoingRow = rows.find((row) => row.textContent?.includes('Ingoing'))!;
    const ingoingColorWhenTrailing = within(ingoingRow)
      .getByText('10 · 10%')
      .parentElement!.querySelector<HTMLElement>('span[aria-hidden="true"]')!.style.backgroundColor;

    expect(ingoingColorWhenTrailing).toBe(ingoingColorWhenLeading);
  });

  it('folds the tail past the palette into a single Other segment', () => {
    const distribution = [
      entry('A', 'Type A', 10),
      entry('B', 'Type B', 10),
      entry('C', 'Type C', 10),
      entry('D', 'Type D', 10),
      entry('E', 'Type E', 10),
      entry('F', 'Type F', 5),
      entry('G', 'Type G', 5),
    ];
    const { container } = render(<ServiceTypeDistribution distribution={distribution} />);

    // Never a generated 6th+ hue — the tail collapses instead. Seven inputs
    // become five named rows plus one "Other".
    expect(screen.getByText('Other (2)')).toBeInTheDocument();
    expect(screen.queryByText('Type F')).not.toBeInTheDocument();
    expect(screen.queryByText('Type G')).not.toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(6);
  });

  it('never assigns more hues than the validated palette holds', () => {
    const distribution = Array.from({ length: 9 }, (_, index) =>
      entry(`T${index}`, `Type ${index}`, 10),
    );
    const { container } = render(<ServiceTypeDistribution distribution={distribution} />);
    const used = new Set(swatchColors(container));
    expect(used.size).toBeLessThanOrEqual(CATEGORICAL_SERIES.length + 1);
  });

  it('offers the table view the contrast rule requires', () => {
    render(<ServiceTypeDistribution distribution={[entry('ROUTINE', 'Routine Inspection', 75)]} />);
    fireEvent.click(screen.getByRole('button', { name: /table/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Share' })).toBeInTheDocument();
  });

  it('renders an empty message rather than a zero-width bar', () => {
    render(<ServiceTypeDistribution distribution={[]} />);
    expect(screen.getByText(/no data for this period/i)).toBeInTheDocument();
  });
});
