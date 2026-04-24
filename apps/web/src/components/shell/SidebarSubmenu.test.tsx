import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarSubmenu } from './SidebarSubmenu';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

const ITEMS = [
  { icon: 'mdi-cog', label: 'General', to: '/settings/general' },
  { icon: 'mdi-palette', label: 'Appearance', to: '/settings/appearance' },
];

function renderDesktop(label = 'Configuration') {
  return render(
    <MemoryRouter>
      <SidebarSubmenu icon="mdi-cog-outline" label={label} items={ITEMS} />
    </MemoryRouter>,
  );
}

describe('SidebarSubmenu (desktop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders trigger button with correct aria attributes when closed', () => {
    renderDesktop();
    const trigger = screen.getByRole('button', { name: /configuration/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens submenu portal into document.body on mouseenter', () => {
    renderDesktop();
    const container = screen.getByRole('button', { name: /configuration/i }).closest('div')!;
    fireEvent.mouseEnter(container);
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu).toHaveTextContent('General');
  });

  it('sets aria-expanded to true when submenu is open', () => {
    renderDesktop();
    const container = screen.getByRole('button', { name: /configuration/i }).closest('div')!;
    fireEvent.mouseEnter(container);
    const trigger = screen.getByRole('button', { name: /configuration/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps submenu open when cursor moves from trigger to submenu (hover continuity)', () => {
    renderDesktop();
    const container = screen.getByRole('button', { name: /configuration/i }).closest('div')!;
    fireEvent.mouseEnter(container);
    // Cursor leaves trigger container
    fireEvent.mouseLeave(container);
    // Before 150ms close delay, cursor enters portal
    const menu = document.body.querySelector('[role="menu"]')!;
    fireEvent.mouseEnter(menu);
    // Advance past the close delay
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('closes submenu after cursor leaves both trigger and submenu', () => {
    renderDesktop();
    const container = screen.getByRole('button', { name: /configuration/i }).closest('div')!;
    fireEvent.mouseEnter(container);
    fireEvent.mouseLeave(container);
    // Do NOT enter the portal — let the timer fire
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes submenu and returns focus to trigger on Escape', () => {
    renderDesktop();
    const container = screen.getByRole('button', { name: /configuration/i }).closest('div')!;
    fireEvent.mouseEnter(container);
    const menu = document.body.querySelector('[role="menu"]')!;
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /configuration/i }));
  });
});
