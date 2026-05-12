/**
 * 026 §FR-560 — AppointmentCodePill optional clickable variant.
 *
 * Pre-026 the pill was display-only. 026 adds an opt-in `onClick` prop
 * that flips the pill to button semantics (role="button", keyboard
 * activation, focus ring). Display-only callers (panel header, etc.)
 * keep working unchanged — the test below pins both surfaces.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppointmentCodePill } from './AppointmentCodePill';

describe('AppointmentCodePill', () => {
  it('renders display-only when onClick is absent (preserves 025 callers)', () => {
    render(<AppointmentCodePill code="INS-0042" />);
    const pill = screen.getByTestId('appointment-code-pill');
    expect(pill.tagName).toBe('SPAN');
    expect(pill.getAttribute('role')).toBeNull();
    expect(pill.className).not.toContain('cursor-pointer');
  });

  it('renders as a button when onClick is provided', () => {
    render(<AppointmentCodePill code="INS-0042" onClick={vi.fn()} />);
    const pill = screen.getByTestId('appointment-code-pill');
    expect(pill.getAttribute('role')).toBe('button');
    expect(pill.getAttribute('tabindex')).toBe('0');
    expect(pill.getAttribute('aria-label')).toBe('Open details for appointment INS-0042');
    expect(pill.className).toContain('cursor-pointer');
  });

  it('fires onClick on click', () => {
    const onClick = vi.fn();
    render(<AppointmentCodePill code="INS-0042" onClick={onClick} />);
    fireEvent.click(screen.getByTestId('appointment-code-pill'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Enter key', () => {
    const onClick = vi.fn();
    render(<AppointmentCodePill code="INS-0042" onClick={onClick} />);
    fireEvent.keyDown(screen.getByTestId('appointment-code-pill'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Space key', () => {
    const onClick = vi.fn();
    render(<AppointmentCodePill code="INS-0042" onClick={onClick} />);
    fireEvent.keyDown(screen.getByTestId('appointment-code-pill'), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire on other keys', () => {
    const onClick = vi.fn();
    render(<AppointmentCodePill code="INS-0042" onClick={onClick} />);
    fireEvent.keyDown(screen.getByTestId('appointment-code-pill'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByTestId('appointment-code-pill'), { key: 'Tab' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stops click event propagation so parent row handlers do not fire', () => {
    const parentClick = vi.fn();
    const onClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <AppointmentCodePill code="INS-0042" onClick={onClick} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('appointment-code-pill'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('honours a custom aria-label when provided', () => {
    render(<AppointmentCodePill code="INS-0042" onClick={vi.fn()} ariaLabel="Custom label" />);
    expect(screen.getByTestId('appointment-code-pill').getAttribute('aria-label')).toBe('Custom label');
  });
});
