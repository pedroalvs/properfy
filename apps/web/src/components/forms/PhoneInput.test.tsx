import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput } from './PhoneInput';

function ControlledPhoneInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <PhoneInput value={value} onChange={setValue} aria-label="Phone" />
      <button onClick={() => setValue('')}>Reset</button>
    </div>
  );
}

describe('PhoneInput', () => {
  it('applies the Australian mask while typing', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.type(screen.getByLabelText('Phone'), '0412345678');
    expect(screen.getByLabelText('Phone')).toHaveValue('0412 345 678');
  });

  it('shows a validation error on blur for an invalid AU number', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.type(screen.getByLabelText('Phone'), '123');
    await user.tab();
    expect(screen.getByText('Enter a valid Australian phone number')).toBeInTheDocument();
  });

  it('does not show an error on blur for a valid AU number', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.type(screen.getByLabelText('Phone'), '0412 345 678');
    await user.tab();
    expect(screen.queryByText('Enter a valid Australian phone number')).not.toBeInTheDocument();
  });

  it('does not show an error on blur when empty', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.click(screen.getByLabelText('Phone'));
    await user.tab();
    expect(screen.queryByText('Enter a valid Australian phone number')).not.toBeInTheDocument();
  });

  it('clears the blur error when typing resumes', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.type(screen.getByLabelText('Phone'), '123');
    await user.tab();
    expect(screen.getByText('Enter a valid Australian phone number')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Phone'), '4');
    expect(screen.queryByText('Enter a valid Australian phone number')).not.toBeInTheDocument();
  });

  it('clears the blur error when the value is reset programmatically', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.type(screen.getByLabelText('Phone'), '123');
    await user.tab();
    expect(screen.getByText('Enter a valid Australian phone number')).toBeInTheDocument();
    await user.click(screen.getByText('Reset'));
    expect(screen.queryByText('Enter a valid Australian phone number')).not.toBeInTheDocument();
  });

  it('accepts international +61 input', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);
    await user.type(screen.getByLabelText('Phone'), '+61412345678');
    await user.tab();
    expect(screen.getByLabelText('Phone')).toHaveValue('+61 412 345 678');
    expect(screen.queryByText('Enter a valid Australian phone number')).not.toBeInTheDocument();
  });

  it('suppresses the local message when an external error is passed', () => {
    const onChange = vi.fn();
    render(<PhoneInput value="123" onChange={onChange} error aria-label="Phone" />);
    expect(screen.queryByText('Enter a valid Australian phone number')).not.toBeInTheDocument();
  });
});
