import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LiveDayLegend, type LegendRoute } from './LiveDayLegend';

const routes = (n: number): LegendRoute[] =>
  Array.from({ length: n }, (_, i) => ({ inspectorId: `i${i}`, inspectorName: `Inspector ${i}`, color: '#156537' }));

describe('LiveDayLegend', () => {
  it('always shows the four state items', () => {
    render(<LiveDayLegend showAll={false} routes={[]} />);
    const states = screen.getByRole('list', { name: 'States' });
    expect(states).toBeInTheDocument();
    for (const label of ['Not started', 'At a property', 'In transit', 'Done for the day']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the Routes section only when show-all is on', () => {
    const { rerender } = render(<LiveDayLegend showAll={false} routes={routes(3)} />);
    expect(screen.queryByRole('list', { name: 'Route colours' })).toBeNull();

    rerender(<LiveDayLegend showAll routes={routes(3)} />);
    const list = screen.getByRole('list', { name: 'Route colours' });
    expect(within(list).getByText('Inspector 0')).toBeInTheDocument();
  });

  it('scrolls the route list above 12 entries', () => {
    render(<LiveDayLegend showAll routes={routes(13)} />);
    const list = screen.getByRole('list', { name: 'Route colours' });
    expect(list.className).toContain('overflow-y-auto');
  });

  it('does not scroll at or below 12 entries', () => {
    render(<LiveDayLegend showAll routes={routes(12)} />);
    const list = screen.getByRole('list', { name: 'Route colours' });
    expect(list.className).not.toContain('overflow-y-auto');
  });
});
