import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentBulkActionBar } from './AppointmentBulkActionBar';

function renderBar(overrides: Partial<Parameters<typeof AppointmentBulkActionBar>[0]> = {}) {
  return render(
    <AppointmentBulkActionBar
      selectedCount={2}
      onClearSelection={vi.fn()}
      onBulkEdit={vi.fn()}
      {...overrides}
    />,
  );
}

/** The fixed bar is the only element carrying the `fixed` positioning class. */
function bar(): HTMLElement {
  const el = document.querySelector('div.fixed');
  if (!el) throw new Error('bulk action bar not rendered');
  return el as HTMLElement;
}

describe('AppointmentBulkActionBar', () => {
  it('renders nothing when no appointment is selected', () => {
    const { container } = renderBar({ selectedCount: 0 });

    expect(container).toBeEmptyDOMElement();
  });

  it('pluralises the selection count', () => {
    const { rerender } = renderBar({ selectedCount: 1 });
    expect(screen.getByText('1 appointment selected')).toBeInTheDocument();

    rerender(
      <AppointmentBulkActionBar
        selectedCount={3}
        onClearSelection={vi.fn()}
        onBulkEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('3 appointments selected')).toBeInTheDocument();
  });

  it('omits the re-send action unless the actor may use it', () => {
    renderBar();

    expect(screen.queryByRole('button', { name: /re-send reminder/i })).not.toBeInTheDocument();
  });

  it('shows the re-send action when permitted', () => {
    renderBar({ canBulkResend: true, onBulkResend: vi.fn() });

    expect(screen.getByRole('button', { name: /re-send reminder \(2\)/i })).toBeInTheDocument();
  });

  describe('sidebar offset', () => {
    // The shell only renders the fixed sidebar from `md` up (`hidden md:block`,
    // and the content uses `md:ml-sidebar`). An unconditional offset therefore
    // left a 75px dead strip down the left of the bar on phones — confirmed in a
    // real browser at 390px before this was fixed.
    it('does not reserve sidebar space below the md breakpoint', () => {
      renderBar();

      expect(bar().className).toContain('left-0');
      expect(bar().className).not.toMatch(/(?<!md:)left-\[75px\]/);
    });

    it('clears the sidebar from md up, via the spacing token', () => {
      renderBar();

      // `md:left-sidebar`, not a hardcoded 75px: the width lives in the Tailwind
      // config and the shell reads it the same way.
      expect(bar().className).toContain('md:left-sidebar');
      expect(bar().className).not.toContain('[75px]');
    });
  });
});
