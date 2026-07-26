import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectInput } from './SelectInput';

const options = [
  { label: 'Ativo', value: 'active' },
  { label: 'Inativo', value: 'inactive' },
  { label: 'Bloqueado', value: 'locked' },
];

describe('SelectInput', () => {
  it('renders selected option label', () => {
    render(<SelectInput value="active" onChange={() => {}} options={options} aria-label="Status" />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders placeholder when no value', () => {
    render(
      <SelectInput value="" onChange={() => {}} options={options} placeholder="Selecione" aria-label="Status" />,
    );
    expect(screen.getByText('Selecione')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(<SelectInput value="" onChange={() => {}} options={options} aria-label="Status" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('selects option and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectInput value="" onChange={onChange} options={options} aria-label="Status" />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Inativo'));
    expect(onChange).toHaveBeenCalledWith('inactive');
  });

  it('closes dropdown after selection', async () => {
    const user = userEvent.setup();
    render(<SelectInput value="" onChange={() => {}} options={options} aria-label="Status" />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Ativo'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows disabled state', () => {
    render(<SelectInput value="" onChange={() => {}} options={options} disabled aria-label="Status" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies error styling when error is true', () => {
    const { container } = render(
      <SelectInput value="" onChange={() => {}} options={options} error aria-label="Status" />,
    );
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });
});

/**
 * Placement — jsdom performs no layout, so geometry is stubbed. These pin the
 * behaviour the staging bug exposed: a trigger pinned near the bottom of a
 * scrolling dialog must open upward instead of into the clipped region.
 */
describe('SelectInput dropdown placement', () => {
  function renderInScroller(triggerTop: number, scrollerBottom: number) {
    render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <SelectInput value="" onChange={() => {}} options={options} aria-label="Status" />
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    scroller.getBoundingClientRect = () =>
      ({ top: 200, bottom: scrollerBottom, height: scrollerBottom - 200 }) as DOMRect;
    // The SelectInput's own wrapper is the button's parent — addressing it via
    // a CSS descendant selector would match the scroller first.
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;
    wrapper.getBoundingClientRect = () =>
      ({ top: triggerTop, bottom: triggerTop + 40, height: 40 }) as DOMRect;
    return wrapper;
  }

  it('opens downward when the scrolling container has room below', async () => {
    const user = userEvent.setup();
    renderInScroller(240, 800);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox').className).toContain('top-full');
    expect(screen.getByRole('listbox').className).not.toContain('bottom-full');
  });

  it('opens upward when the trigger is pinned to the container bottom', async () => {
    const user = userEvent.setup();
    // Trigger ends at 572; the scroller ends at 576 — 4px of room, the exact
    // geometry measured on staging.
    renderInScroller(532, 576);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox').className).toContain('bottom-full');
  });
});
