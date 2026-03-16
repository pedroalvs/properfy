import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableSwitch } from './TableSwitch';

describe('TableSwitch', () => {
  it('renders with switch role', () => {
    render(<TableSwitch enabled={false} onChange={() => {}} label="Mostrar extras" />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('reflects enabled state via aria-checked', () => {
    render(<TableSwitch enabled={true} onChange={() => {}} label="Extras" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('reflects disabled state via aria-checked', () => {
    render(<TableSwitch enabled={false} onChange={() => {}} label="Extras" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders label text', () => {
    render(<TableSwitch enabled={false} onChange={() => {}} label="Mostrar extras" />);
    expect(screen.getByText('Mostrar extras')).toBeInTheDocument();
  });

  it('calls onChange with toggled value on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TableSwitch enabled={false} onChange={onChange} label="Toggle" />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('applies primary color when enabled', () => {
    render(<TableSwitch enabled={true} onChange={() => {}} label="Test" />);
    expect(screen.getByRole('switch').className).toContain('bg-primary');
  });
});
