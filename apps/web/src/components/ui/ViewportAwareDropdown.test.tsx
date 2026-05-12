/**
 * 026 §FR-501 — ViewportAwareDropdown primitive.
 *
 * jsdom doesn't lay out elements, so we stub `getBoundingClientRect` on
 * the trigger to control the auto-flip placement decision. The tests
 * pin the visible side via `data-placement` so a regression in the flip
 * math is caught durably.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewportAwareDropdown } from './ViewportAwareDropdown';

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function stubTriggerRect(rect: Partial<DOMRect>) {
  // The dropdown reads `getBoundingClientRect` on the trigger wrapper,
  // which is the first child of `[data-testid="viewport-aware-dropdown"]`.
  // jsdom returns all zeros by default — stub the prototype so the next
  // call returns the controlled rect.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? (rect.left ?? 0) + 100,
    bottom: rect.bottom ?? (rect.top ?? 0) + 30,
    width: rect.width ?? 100,
    height: rect.height ?? 30,
    toJSON: () => ({}),
  } as DOMRect);
}

beforeEach(() => {
  vi.restoreAllMocks();
  setViewport(1280, 800);
});

describe('ViewportAwareDropdown', () => {
  it('does not render the menu when closed', () => {
    render(
      <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
        <div>menu-content</div>
      </ViewportAwareDropdown>,
    );
    expect(screen.queryByTestId('viewport-aware-dropdown-menu')).toBeNull();
  });

  it('opens on trigger click and renders the menu', () => {
    render(
      <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
        <div>menu-content</div>
      </ViewportAwareDropdown>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('viewport-aware-dropdown-menu')).toBeInTheDocument();
    expect(screen.getByText('menu-content')).toBeInTheDocument();
  });

  it('flips to "top" placement when the trigger is at the bottom edge', () => {
    // Trigger near the bottom of the viewport — no room below for a 240px menu.
    stubTriggerRect({ left: 200, top: 750, right: 300, bottom: 780, width: 100, height: 30 });
    render(
      <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
        <div style={{ height: 240 }}>menu</div>
      </ViewportAwareDropdown>,
    );
    fireEvent.click(screen.getByText('Open'));
    const menu = screen.getByTestId('viewport-aware-dropdown-menu');
    expect(menu.getAttribute('data-placement')).toBe('top');
  });

  it('uses "bottom" placement when there is room below', () => {
    stubTriggerRect({ left: 200, top: 100, right: 300, bottom: 130, width: 100, height: 30 });
    render(
      <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
        <div style={{ height: 240 }}>menu</div>
      </ViewportAwareDropdown>,
    );
    fireEvent.click(screen.getByText('Open'));
    const menu = screen.getByTestId('viewport-aware-dropdown-menu');
    expect(menu.getAttribute('data-placement')).toBe('bottom');
  });

  it('honours explicit placement="top" without auto-flip', () => {
    stubTriggerRect({ left: 200, top: 100, right: 300, bottom: 130, width: 100, height: 30 });
    render(
      <ViewportAwareDropdown
        placement="top"
        trigger={<button type="button">Open</button>}
      >
        <div>menu</div>
      </ViewportAwareDropdown>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('viewport-aware-dropdown-menu').getAttribute('data-placement')).toBe('top');
  });

  it('closes on Escape', () => {
    render(
      <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
        <div>menu-content</div>
      </ViewportAwareDropdown>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('viewport-aware-dropdown-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('viewport-aware-dropdown-menu')).toBeNull();
  });

  it('closes on outside click', () => {
    render(
      <div>
        <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
          <div>menu-content</div>
        </ViewportAwareDropdown>
        <button type="button" data-testid="outside">Outside</button>
      </div>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('viewport-aware-dropdown-menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('viewport-aware-dropdown-menu')).toBeNull();
  });

  it('exposes aria-haspopup + aria-expanded on the trigger wrapper', () => {
    render(
      <ViewportAwareDropdown trigger={<button type="button">Open</button>}>
        <div>menu</div>
      </ViewportAwareDropdown>,
    );
    const wrapper = screen.getByTestId('viewport-aware-dropdown').firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-haspopup')).toBe('menu');
    expect(wrapper.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByText('Open'));
    expect(wrapper.getAttribute('aria-expanded')).toBe('true');
  });
});
