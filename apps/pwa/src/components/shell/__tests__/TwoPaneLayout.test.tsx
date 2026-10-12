import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TwoPaneLayout } from '../TwoPaneLayout';

const master = <div data-testid="master-content">Master</div>;
const detail = <div data-testid="detail-content">Detail</div>;
const empty = <div data-testid="empty-content">Pick one</div>;

describe('TwoPaneLayout', () => {
  it('becomes a 2-column grid at the md breakpoint (master variant = narrow left)', () => {
    render(<TwoPaneLayout master={master} detail={detail} emptyState={empty} hasSelection={false} />);
    const grid = screen.getByTestId('two-pane-layout');
    expect(grid.className).toContain('md:grid');
    expect(grid.className).toContain('md:grid-cols-[minmax(320px,360px)_1fr]');
  });

  it('uses the canvas template when variant="canvas"', () => {
    render(
      <TwoPaneLayout
        master={master}
        detail={detail}
        emptyState={empty}
        hasSelection={false}
        variant="canvas"
      />,
    );
    expect(screen.getByTestId('two-pane-layout').className).toContain(
      'md:grid-cols-[1fr_minmax(340px,400px)]',
    );
  });

  it('shows the empty state (not the detail) when nothing is selected', () => {
    render(<TwoPaneLayout master={master} detail={detail} emptyState={empty} hasSelection={false} />);
    expect(screen.getByTestId('empty-content')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-content')).not.toBeInTheDocument();
  });

  it('shows the detail (not the empty state) when a selection is active', () => {
    render(<TwoPaneLayout master={master} detail={detail} emptyState={empty} hasSelection />);
    expect(screen.getByTestId('detail-content')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-content')).not.toBeInTheDocument();
  });

  describe('inline mode (default) — phone swaps master and detail', () => {
    it('keeps the master visible on phone when nothing is selected', () => {
      render(<TwoPaneLayout master={master} detail={detail} emptyState={empty} hasSelection={false} />);
      // Master not hidden on phone; detail hidden on phone (empty pane is tablet-only).
      expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
      expect(screen.getByTestId('two-pane-detail').className).toContain('hidden md:block');
    });

    it('hides the master on phone when a detail is selected (detail fills the screen)', () => {
      render(<TwoPaneLayout master={master} detail={detail} emptyState={empty} hasSelection />);
      expect(screen.getByTestId('two-pane-master').className).toContain('hidden md:block');
      expect(screen.getByTestId('two-pane-detail').className).not.toContain('hidden');
    });
  });

  describe('overlay mode — phone keeps the master and uses its own sheet', () => {
    it('never hides the master and keeps the detail pane tablet-only', () => {
      const { rerender } = render(
        <TwoPaneLayout
          master={master}
          detail={detail}
          emptyState={empty}
          hasSelection={false}
          detailMode="overlay"
        />,
      );
      expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
      expect(screen.getByTestId('two-pane-detail').className).toContain('hidden md:block');

      rerender(
        <TwoPaneLayout
          master={master}
          detail={detail}
          emptyState={empty}
          hasSelection
          detailMode="overlay"
        />,
      );
      // Still never hides the master on phone, even with a selection.
      expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
      expect(screen.getByTestId('two-pane-detail').className).toContain('hidden md:block');
    });
  });
});
