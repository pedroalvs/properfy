import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateInput } from './DateInput';

function getInput(): HTMLInputElement {
  return screen.getByLabelText('Scheduled date') as HTMLInputElement;
}

/** A realistic parent: controlled value plus a fresh inline lambda each render. */
function ControlledDateInput({
  initial = '',
  onValue,
  ...rest
}: { initial?: string; onValue?: (v: string) => void } & Record<string, unknown>) {
  const [value, setValue] = useState(initial);
  return (
    <DateInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      aria-label="Scheduled date"
      {...rest}
    />
  );
}

describe('DateInput masking', () => {
  it('renders dd/mm/yyyy as digits are typed', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);

    await user.type(getInput(), '15062026');

    expect(getInput().value).toBe('15/06/2026');
  });

  it('emits the canonical ISO value, not the displayed text', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateInput onValue={onValue} />);

    await user.type(getInput(), '15062026');

    expect(onValue).toHaveBeenLastCalledWith('2026-06-15');
  });

  it('shows an existing value in masked form', () => {
    render(<ControlledDateInput initial="2026-06-15" />);
    expect(getInput().value).toBe('15/06/2026');
  });

  it('is a text input, so the browser locale cannot change its format', () => {
    // The whole point: <input type="date"> renders in the OS locale.
    render(<ControlledDateInput initial="2026-06-15" />);
    expect(getInput().type).toBe('text');
  });
});

describe('DateInput validity', () => {
  it('does not emit a complete value while the date is incomplete', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateInput onValue={onValue} />);

    await user.type(getInput(), '1506');

    expect(onValue).not.toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-/));
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks an impossible calendar date invalid without discarding what was typed', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);

    await user.type(getInput(), '31022026');

    // The user fixes this by editing one digit; the text must survive.
    expect(getInput().value).toBe('31/02/2026');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('emits an out-of-range date and flags it, rather than clamping or blocking', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateInput onValue={onValue} min="2026-06-20" />);

    await user.type(getInput(), '15062026');

    // Consumers render their own "date is in the past" message and need the value.
    expect(onValue).toHaveBeenLastCalledWith('2026-06-15');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears back to an empty canonical value', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateInput initial="2026-06-15" onValue={onValue} />);

    await user.clear(getInput());

    expect(onValue).toHaveBeenLastCalledWith('');
  });
});

describe('DateInput backspace', () => {
  it('deletes through the separator instead of appearing dead', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);
    const input = getInput();

    await user.type(input, '1506');
    expect(input.value).toBe('15/06/');

    await user.type(input, '{Backspace}');
    expect(input.value).toBe('15/0');

    await user.type(input, '{Backspace}');
    expect(input.value).toBe('15/');
  });
});

/**
 * These pin the render-loop hazard described in useMaskedField: a naive
 * `useEffect(..., [value])` sync steals the caret on every keystroke and resets
 * the draft whenever an unstable parent re-renders.
 */
describe('DateInput controlled-value reconciliation', () => {
  it('does not move the caret when the parent echoes the value back', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);
    const input = getInput();

    await user.type(input, '15062026');

    // A full round-trip through the parent has happened by now.
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.value).toBe('15/06/2026');
  });

  it('keeps a partial draft when an unstable parent re-renders mid-typing', async () => {
    const user = userEvent.setup();

    function UnstableParent() {
      const [value, setValue] = useState('');
      const [, forceRender] = useState(0);
      return (
        <>
          <button type="button" onClick={() => forceRender((n) => n + 1)}>
            re-render
          </button>
          {/* A brand-new lambda on every render, as every real consumer passes. */}
          <DateInput value={value} onChange={(v) => setValue(v)} aria-label="Scheduled date" />
        </>
      );
    }

    render(<UnstableParent />);
    await user.type(getInput(), '1506');

    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 're-render' }));
    }

    // The half-typed draft emits '' — a dependency-driven effect would wipe it.
    expect(getInput().value).toBe('15/06/');
  });

  it('re-syncs when the value genuinely changes from outside', () => {
    const { rerender } = render(
      <DateInput value="2026-06-15" onChange={() => {}} aria-label="Scheduled date" />,
    );
    expect(getInput().value).toBe('15/06/2026');

    rerender(<DateInput value="2026-07-20" onChange={() => {}} aria-label="Scheduled date" />);
    expect(getInput().value).toBe('20/07/2026');
  });
});

describe('DateInput wholesale replacement', () => {
  it('accepts a canonical ISO value set in one shot', () => {
    // Playwright fill(), browser autofill and pasting a spreadsheet cell all
    // replace the entire value rather than typing it.
    const onValue = vi.fn();
    render(<ControlledDateInput onValue={onValue} />);

    fireEvent.change(getInput(), { target: { value: '2026-06-15' } });

    expect(getInput().value).toBe('15/06/2026');
    expect(onValue).toHaveBeenLastCalledWith('2026-06-15');
  });

  it('accepts a pasted masked date', () => {
    const onValue = vi.fn();
    render(<ControlledDateInput onValue={onValue} />);

    fireEvent.change(getInput(), { target: { value: '15/06/2026' } });

    expect(onValue).toHaveBeenLastCalledWith('2026-06-15');
  });
});

describe('DateInput calendar popover', () => {
  it('opens a dialog from the calendar button', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput initial="2026-06-15" />);

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open calendar' }));

    expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeInTheDocument();
    expect(screen.getByText('June 2026')).toBeInTheDocument();
  });

  it('picking a day sets the value and closes', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateInput initial="2026-06-15" onValue={onValue} />);

    await user.click(screen.getByRole('button', { name: 'Open calendar' }));
    await user.click(screen.getByRole('button', { name: 'Wednesday 24 June 2026' }));

    expect(onValue).toHaveBeenLastCalledWith('2026-06-24');
    expect(getInput().value).toBe('24/06/2026');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables days outside min/max', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput initial="2026-06-15" min="2026-06-10" max="2026-06-20" />);

    await user.click(screen.getByRole('button', { name: 'Open calendar' }));

    expect(screen.getByRole('button', { name: 'Monday 1 June 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Friday 12 June 2026' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thursday 25 June 2026' })).toBeDisabled();
  });

  it('does not clamp min to today, so past dates stay selectable', async () => {
    // MultiDatePicker clamps to today, which would make date-of-birth unusable.
    const user = userEvent.setup();
    render(<ControlledDateInput initial="1986-03-18" />);

    await user.click(screen.getByRole('button', { name: 'Open calendar' }));

    expect(screen.getByText('March 1986')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuesday 18 March 1986' })).not.toBeDisabled();
  });

  it('navigates months', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput initial="2026-06-15" />);

    await user.click(screen.getByRole('button', { name: 'Open calendar' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('July 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('June 2026')).toBeInTheDocument();
  });

  it('closes on Escape without bubbling to a host dialog', async () => {
    const user = userEvent.setup();
    const onHostEscape = vi.fn();
    render(
      <div onKeyDown={onHostEscape}>
        <ControlledDateInput initial="2026-06-15" />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Open calendar' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onHostEscape).not.toHaveBeenCalled();
  });

  it('offers no calendar button when disabled', () => {
    render(<ControlledDateInput disabled />);
    expect(screen.queryByRole('button', { name: 'Open calendar' })).toBeNull();
  });
});

describe('DateInput accessibility and states', () => {
  it('exposes a format hint to screen readers', () => {
    render(<ControlledDateInput />);
    expect(getInput()).toHaveAccessibleDescription(/day slash month slash year/i);
  });

  it('disables the field', () => {
    render(<ControlledDateInput disabled />);
    expect(getInput()).toBeDisabled();
  });

  it('applies the error ring when the consumer flags an error', () => {
    const { container } = render(<ControlledDateInput error />);
    expect(container.firstChild).toHaveClass('shadow-[0_0_0_2px_var(--color-error)]');
  });
});
