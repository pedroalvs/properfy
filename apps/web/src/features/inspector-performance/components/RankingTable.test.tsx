import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RankingTable, type RankedInspector } from './RankingTable';
import { rankingFixture, INSPECTOR_IDS } from '../__fixtures__/reliability';

describe('RankingTable', () => {
  it('renders the four columns and one-decimal scores in server order', () => {
    render(<RankingTable rows={rankingFixture.ranked} onOpen={vi.fn()} />);
    for (const header of ['Rank', 'Inspector', 'Score', 'Services']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(screen.getByText('100.0')).toBeInTheDocument();
    expect(screen.getByText('97.5')).toBeInTheDocument();
    expect(screen.getByText('89.0')).toBeInTheDocument();
    expect(screen.getByText('88.3')).toBeInTheDocument();
    expect(screen.getByText('79.0')).toBeInTheDocument();
  });

  it('keeps the server competition positions on ties (2, 2, 4)', () => {
    const rows: RankedInspector[] = [
      { position: 1, inspectorId: INSPECTOR_IDS.eva, inspectorName: 'Eva', score: 100, volume: 14, completedCount: 14 },
      { position: 2, inspectorId: INSPECTOR_IDS.fabio, inspectorName: 'Fab', score: 97.5, volume: 11, completedCount: 11 },
      { position: 2, inspectorId: INSPECTOR_IDS.dan, inspectorName: 'Dan', score: 97.5, volume: 10, completedCount: 10 },
      { position: 4, inspectorId: INSPECTOR_IDS.ana, inspectorName: 'Ana', score: 80, volume: 9, completedCount: 9 },
    ];
    render(<RankingTable rows={rows} onOpen={vi.fn()} />);
    expect(screen.getAllByLabelText('Rank 2')).toHaveLength(2);
    expect(screen.getByLabelText('Rank 4')).toBeInTheDocument();
  });

  it('opens the drawer via the focusable Inspector-cell control, passing the trigger', () => {
    const onOpen = vi.fn();
    render(<RankingTable rows={rankingFixture.ranked} onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Open Ana Costa details' });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(INSPECTOR_IDS.ana, button);
  });

  it('truncates a long name with a title attribute', () => {
    const longName = 'Maximilian Alexander Fitzgerald Montgomery the Third';
    const rows: RankedInspector[] = [
      { position: 1, inspectorId: INSPECTOR_IDS.eva, inspectorName: longName, score: 90, volume: 10, completedCount: 10 },
    ];
    render(<RankingTable rows={rows} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: `Open ${longName} details` })).toHaveAttribute('title', longName);
  });

  it('shows the no-ranking message when there are no rows', () => {
    render(<RankingTable rows={[]} onOpen={vi.fn()} />);
    expect(screen.getByText('No inspector has enough services to be ranked yet.')).toBeInTheDocument();
  });

  it('labels the table region for screen readers', () => {
    const { container } = render(<RankingTable rows={rankingFixture.ranked} onOpen={vi.fn()} />);
    expect(within(container).getByText('Inspectors ranked by reliability score')).toBeInTheDocument();
  });
});
