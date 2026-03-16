import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBoolean } from './FilterBoolean';

describe('FilterBoolean', () => {
  it('renders label text', () => {
    render(<FilterBoolean label="Favoritos" value={false} onChange={() => {}} />);
    expect(screen.getByText('Favoritos')).toBeInTheDocument();
  });

  it('renders unchecked by default', () => {
    render(<FilterBoolean label="Favoritos" value={false} onChange={() => {}} />);
    expect(screen.getByLabelText('Favoritos')).not.toBeChecked();
  });

  it('renders checked when value is true', () => {
    render(<FilterBoolean label="Favoritos" value={true} onChange={() => {}} />);
    expect(screen.getByLabelText('Favoritos')).toBeChecked();
  });

  it('calls onChange when toggled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterBoolean label="Favoritos" value={false} onChange={onChange} />);

    await user.click(screen.getByLabelText('Favoritos'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
