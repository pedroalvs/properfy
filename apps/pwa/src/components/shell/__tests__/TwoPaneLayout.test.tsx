import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TwoPaneLayout } from '../TwoPaneLayout';

const master = <div data-testid="master-content">Master</div>;
const detail = <div data-testid="detail-content">Detail</div>;

function renderPane(props: Partial<React.ComponentProps<typeof TwoPaneLayout>> = {}) {
  return render(
    <TwoPaneLayout
      master={master}
      detail={detail}
      hasSelection={false}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe('TwoPaneLayout', () => {
  it('lays the panes out as a flex row at the md breakpoint', () => {
    renderPane();
    expect(screen.getByTestId('two-pane-layout').className).toContain('md:flex');
  });

  it('places the detail first (left) and the master second (right) — inverted order', () => {
    renderPane({ hasSelection: true });
    const root = screen.getByTestId('two-pane-layout');
    const detailEl = screen.getByTestId('two-pane-detail');
    const masterEl = screen.getByTestId('two-pane-master');
    const children = Array.from(root.children);
    expect(children.indexOf(detailEl)).toBeLessThan(children.indexOf(masterEl));
  });

  describe('collapse / expand', () => {
    it('collapses the detail to zero width and renders no detail content when nothing is selected', () => {
      renderPane({ hasSelection: false });
      const detailEl = screen.getByTestId('two-pane-detail');
      expect(detailEl.className).toContain('md:w-0');
      expect(detailEl.className).toContain('md:opacity-0');
      expect(screen.queryByTestId('detail-content')).not.toBeInTheDocument();
      // Master fills the width; no empty-state second column.
      expect(screen.getByTestId('two-pane-master').className).toContain('md:flex-1');
    });

    it('expands the detail with a transition and shows the content when selected (master variant)', () => {
      renderPane({ hasSelection: true });
      const detailEl = screen.getByTestId('two-pane-detail');
      expect(detailEl.className).toContain('md:w-[58%]');
      expect(detailEl.className).toContain('md:transition-[width,opacity]');
      expect(screen.getByTestId('detail-content')).toBeInTheDocument();
    });

    it('uses the narrower canvas width so the master keeps the space', () => {
      renderPane({ hasSelection: true, variant: 'canvas' });
      expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-[42%]');
    });
  });

  describe('close control', () => {
    it('shows a close control while open and calls onClose', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderPane({ hasSelection: true, onClose });
      await user.click(screen.getByTestId('two-pane-close'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('omits the frame close when showClose is false (detail provides its own)', () => {
      renderPane({ hasSelection: true, showClose: false });
      expect(screen.queryByTestId('two-pane-close')).not.toBeInTheDocument();
    });
  });

  describe('inline mode (default) — phone swaps master and detail', () => {
    it('keeps the master visible on phone when nothing is selected', () => {
      renderPane({ hasSelection: false });
      expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
      expect(screen.getByTestId('two-pane-detail').className).toContain('hidden md:block');
    });

    it('hides the master on phone when a detail is selected (detail fills the screen)', () => {
      renderPane({ hasSelection: true });
      expect(screen.getByTestId('two-pane-master').className).toContain('hidden md:block');
      // The detail is shown on phone (`block`), not phone-hidden. (It always carries
      // `md:overflow-hidden`, so match the phone-hide class specifically, not bare "hidden".)
      expect(screen.getByTestId('two-pane-detail').className).not.toContain('hidden md:block');
      expect(screen.getByTestId('two-pane-detail').className).toContain('block');
    });
  });

  describe('overlay mode — phone keeps the master and uses its own sheet', () => {
    it('never hides the master and keeps the detail pane tablet-only', () => {
      renderPane({ hasSelection: true, detailMode: 'overlay' });
      expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
      expect(screen.getByTestId('two-pane-detail').className).toContain('hidden md:block');
    });
  });
});
