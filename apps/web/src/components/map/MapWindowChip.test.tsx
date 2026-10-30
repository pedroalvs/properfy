import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapWindowChip } from './MapWindowChip';

describe('MapWindowChip (F00)', () => {
  // C12 — static (CL): a labelled span, no remove button.
  it('C12: renders a static, non-interactive chip when not removable', () => {
    render(<MapWindowChip label="Today + 14 days" />);
    const chip = screen.getByTestId('map-window-chip');
    expect(chip.tagName).toBe('SPAN');
    expect(chip).toHaveAttribute('aria-label', 'Date window: Today + 14 days');
    expect(screen.getByText('Today + 14 days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove date window' })).not.toBeInTheDocument();
  });

  // C13 — removable (AM/OP): a ✕ button fires onRemove and returns focus.
  it('C13: removable chip fires onRemove and returns focus to the ref target', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const returnRef = createRef<HTMLButtonElement>();
    render(
      <div>
        <button ref={returnRef} type="button">
          anchor
        </button>
        <MapWindowChip
          label="Today + 30 days"
          removable
          onRemove={onRemove}
          returnFocusRef={returnRef}
        />
      </div>,
    );

    const remove = screen.getByRole('button', { name: 'Remove date window' });
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
    // Focus is returned on the next frame.
    await vi.waitFor(() => expect(returnRef.current).toHaveFocus());
  });
});
