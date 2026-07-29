import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTimeInput } from './DateTimeInput';

function ControlledDateTimeInput({
  initial = '',
  onValue,
}: {
  initial?: string;
  onValue?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateTimeInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
      aria-label="Payment Date"
    />
  );
}

const dateField = () => screen.getByLabelText('Payment Date - date') as HTMLInputElement;
const timeField = () => screen.getByLabelText('Payment Date - time') as HTMLInputElement;

describe('DateTimeInput', () => {
  it('splits an existing composite value across the two halves', () => {
    render(<ControlledDateTimeInput initial="2026-06-15T14:30" />);
    expect(dateField().value).toBe('15/06/2026');
    expect(timeField().value).toBe('2:30 pm');
  });

  it('emits the composite value once both halves are complete', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateTimeInput onValue={onValue} />);

    await user.type(dateField(), '15062026');
    await user.type(timeField(), '230p');

    expect(onValue).toHaveBeenLastCalledWith('2026-06-15T14:30');
  });
});

/**
 * Completing one half emits `''` while the other is empty. Deriving both halves
 * from that empty value on the next render would wipe the entry just made.
 */
describe('DateTimeInput keeps each half independent', () => {
  it('keeps the date when it is entered first', async () => {
    const user = userEvent.setup();
    render(<ControlledDateTimeInput />);

    await user.type(dateField(), '15062026');

    // The composite is still '' because the time is missing — the date must survive.
    expect(dateField().value).toBe('15/06/2026');
  });

  it('keeps the time when it is entered first', async () => {
    const user = userEvent.setup();
    render(<ControlledDateTimeInput />);

    await user.type(timeField(), '230p');

    expect(timeField().value).toBe('2:30 pm');
  });

  it('supports time-first entry all the way to a complete value', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateTimeInput onValue={onValue} />);

    await user.type(timeField(), '230p');
    await user.type(dateField(), '15062026');

    expect(timeField().value).toBe('2:30 pm');
    expect(dateField().value).toBe('15/06/2026');
    expect(onValue).toHaveBeenLastCalledWith('2026-06-15T14:30');
  });

  it('keeps the other half when one is cleared', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<ControlledDateTimeInput initial="2026-06-15T14:30" onValue={onValue} />);

    await user.clear(dateField());

    // Matches what a native datetime-local reported for a partial value...
    expect(onValue).toHaveBeenLastCalledWith('');
    // ...without destroying the half the user did not touch.
    expect(timeField().value).toBe('2:30 pm');
  });

  it('re-syncs both halves when the value changes from outside', () => {
    const { rerender } = render(
      <DateTimeInput value="2026-06-15T14:30" onChange={() => {}} aria-label="Payment Date" />,
    );
    expect(dateField().value).toBe('15/06/2026');

    rerender(
      <DateTimeInput value="2026-07-20T09:00" onChange={() => {}} aria-label="Payment Date" />,
    );
    expect(dateField().value).toBe('20/07/2026');
    expect(timeField().value).toBe('9:00 am');
  });
});
