import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawerPanel } from './DrawerPanel';

describe('DrawerPanel', () => {
  it('renders children when open', () => {
    render(
      <DrawerPanel open onClose={() => {}}>
        <p>Drawer content</p>
      </DrawerPanel>,
    );
    expect(screen.getByText('Drawer content')).toBeInTheDocument();
  });

  it('applies narrow width by default', () => {
    render(
      <DrawerPanel open onClose={() => {}}>
        <p>Content</p>
      </DrawerPanel>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('w-drawer-narrow');
  });

  it('applies wide width when specified', () => {
    render(
      <DrawerPanel open onClose={() => {}} size="wide">
        <p>Content</p>
      </DrawerPanel>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('w-drawer-wide');
  });

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DrawerPanel open onClose={onClose}>
        <p>Content</p>
      </DrawerPanel>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
