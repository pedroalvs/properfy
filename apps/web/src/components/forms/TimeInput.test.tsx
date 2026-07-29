import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeInput } from './TimeInput';

function getInput(): HTMLInputElement {
  return screen.getByLabelText('Start time') as HTMLInputElement;
}

function ControlledTimeInput({
  initial = '',
  onValue,
  ...rest
}: { initial?: string; onValue?: (v: string) => void } & Record<string, unknown>) {
  const [value, setValue] = useState(initial);
  return (
    <TimeInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      aria-label="Start time"
      {...rest}
    />
  );
}

describe('TimeInput masking', () => {
  it('renders h:mm as digits are typed', async () => {
    const user = userEvent.setup();
    render(<ControlledTimeInput />);

    await user.type(getInput(), '930');

    expect(getInput().value).toBe('9:30');
  });

  it('keeps a 1 or 0 hour together with its minutes', async () => {
    // The sequence a flat digit buffer mangles into '13:0'.
    const user = userEvent.setup();
    render(<ControlledTimeInput />);

    await user.type(getInput(), '130');

    expect(getInput().value).toBe('1:30');
  });

  it('shows an existing 24-hour value as 12-hour text', () => {
    render(<ControlledTimeInput initial="13:30" />);
    expect(getInput().value).toBe('1:30 pm');
  });

  it('is a text input, so the browser locale cannot change its format', () => {
    render(<ControlledTimeInput initial="13:30" />);
    expect(getInput().type).toBe('text');
  });
});

/**
 * The product deliberately never infers am vs pm. A guess the user does not
 * notice books an inspection twelve hours from where they meant.
 */
describe('TimeInput never guesses the meridiem', () => {
  it('stays invalid and emits nothing while the meridiem is missing', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    await user.type(getInput(), '930');

    expect(getInput().value).toBe('9:30');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
    expect(onValue).not.toHaveBeenCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/));
  });

  it('completes the value when the user types a', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    await user.type(getInput(), '930a');

    expect(getInput().value).toBe('9:30 am');
    expect(onValue).toHaveBeenLastCalledWith('09:30');
    expect(getInput()).not.toHaveAttribute('aria-invalid');
  });

  it('completes the value when the user types p', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    await user.type(getInput(), '930p');

    expect(getInput().value).toBe('9:30 pm');
    expect(onValue).toHaveBeenLastCalledWith('21:30');
  });

  it('completes the value from the toggle, for a numeric keypad', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    await user.type(getInput(), '930');
    await user.click(screen.getByRole('button', { name: 'PM' }));

    expect(onValue).toHaveBeenLastCalledWith('21:30');
  });

  it('lets the user switch the meridiem afterwards', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    await user.type(getInput(), '930a');
    await user.click(screen.getByRole('button', { name: 'PM' }));

    expect(getInput().value).toBe('9:30 pm');
    expect(onValue).toHaveBeenLastCalledWith('21:30');
  });
});

describe('TimeInput 12-hour boundaries', () => {
  it.each([
    ['1200a', '12:00 am', '00:00'],
    ['1200p', '12:00 pm', '12:00'],
    ['1159p', '11:59 pm', '23:59'],
    ['1205a', '12:05 am', '00:05'],
  ])('types %s as %s and emits %s', async (keys, display, canonical) => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    await user.type(getInput(), keys);

    expect(getInput().value).toBe(display);
    expect(onValue).toHaveBeenLastCalledWith(canonical);
  });
});

describe('TimeInput validity and reconciliation', () => {
  it('flags a value before min but still emits it', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} min="10:00" />);

    await user.type(getInput(), '930a');

    // Consumers render their own "start time is in the past" message.
    expect(onValue).toHaveBeenLastCalledWith('09:30');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
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
          <TimeInput value={value} onChange={(v) => setValue(v)} aria-label="Start time" />
        </>
      );
    }

    render(<UnstableParent />);
    await user.type(getInput(), '930');

    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 're-render' }));
    }

    expect(getInput().value).toBe('9:30');
  });

  it('re-syncs when the value genuinely changes from outside', () => {
    const { rerender } = render(
      <TimeInput value="09:00" onChange={() => {}} aria-label="Start time" />,
    );
    expect(getInput().value).toBe('9:00 am');

    rerender(<TimeInput value="14:30" onChange={() => {}} aria-label="Start time" />);
    expect(getInput().value).toBe('2:30 pm');
  });

  it('accepts a wholesale 24-hour value', () => {
    const onValue = vi.fn();
    render(<ControlledTimeInput onValue={onValue} />);

    fireEvent.change(getInput(), { target: { value: '13:00' } });

    expect(getInput().value).toBe('1:00 pm');
    expect(onValue).toHaveBeenLastCalledWith('13:00');
  });
});

describe('TimeInput backspace', () => {
  it('removes the meridiem first, then the digits', async () => {
    const user = userEvent.setup();
    render(<ControlledTimeInput initial="09:30" />);
    const input = getInput();
    expect(input.value).toBe('9:30 am');

    await user.type(input, '{Backspace}');
    expect(input.value).toBe('9:30');

    await user.type(input, '{Backspace}');
    expect(input.value).toBe('9:3');
  });
});

describe('TimeInput accessibility and states', () => {
  it('exposes a format hint to screen readers', () => {
    render(<ControlledTimeInput />);
    expect(getInput()).toHaveAccessibleDescription(/hour colon minutes/i);
  });

  it('hides the meridiem toggle until there is something to qualify', () => {
    render(<ControlledTimeInput />);
    expect(screen.queryByRole('button', { name: 'AM' })).toBeNull();
  });

  it('disables the field and hides the toggle', () => {
    render(<ControlledTimeInput initial="09:30" disabled />);
    expect(getInput()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'AM' })).toBeNull();
  });
});
