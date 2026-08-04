import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthPasswordField } from './AuthPasswordField';

function renderField(props: Partial<React.ComponentProps<typeof AuthPasswordField>> = {}) {
  return render(
    <AuthPasswordField
      id="test-password"
      label="Password"
      value=""
      onChange={() => {}}
      {...props}
    />,
  );
}

describe('AuthPasswordField', () => {
  it('associates the visible label with the input and masks the value by default', () => {
    renderField();

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('toggles between masked and revealed, keeping the button state announced', () => {
    renderField();

    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    const pressed = screen.getByRole('button', { name: 'Hide password' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(pressed);

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  /**
   * The toggle sits inside a <form>; without an explicit type it would default to
   * "submit" and revealing the password would post the login form.
   */
  it('does not submit the surrounding form when toggled', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <AuthPasswordField id="test-password" label="Password" value="" onChange={() => {}} />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('links the error message to the input and flags it as invalid', () => {
    renderField({ error: 'Required field' });

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required field');
  });
});
