import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawerPanel } from './DrawerPanel';
import { Dialog } from './Dialog';

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

  it('locks the page scroll while open and restores it on close', () => {
    const { rerender } = render(
      <DrawerPanel open onClose={() => {}}>
        <p>Content</p>
      </DrawerPanel>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <DrawerPanel open={false} onClose={() => {}}>
        <p>Content</p>
      </DrawerPanel>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the page scroll when unmounted while open', () => {
    const { unmount } = render(
      <DrawerPanel open onClose={() => {}}>
        <p>Content</p>
      </DrawerPanel>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps the page locked when stacked overlays close out of order', () => {
    // Drawer opens first (captures the original overflow), dialog stacks on top.
    const drawer = render(
      <DrawerPanel open onClose={() => {}}>
        <p>Drawer</p>
      </DrawerPanel>,
    );
    const dialog = render(
      <Dialog open onClose={() => {}} title="Stacked">
        <p>Dialog</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    // The overlay that captured the original value closes FIRST — the page
    // must stay locked while the dialog is still open.
    drawer.rerender(
      <DrawerPanel open={false} onClose={() => {}}>
        <p>Drawer</p>
      </DrawerPanel>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    dialog.rerender(
      <Dialog open={false} onClose={() => {}} title="Stacked">
        <p>Dialog</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('');
  });
});
