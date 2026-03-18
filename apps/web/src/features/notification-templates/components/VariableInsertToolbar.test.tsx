import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariableInsertToolbar } from './VariableInsertToolbar';
import { ALLOWED_VARIABLES } from '../types';

describe('VariableInsertToolbar', () => {
  it('renders all allowed variables as chips', () => {
    render(<VariableInsertToolbar onInsert={vi.fn()} />);
    for (const variable of ALLOWED_VARIABLES) {
      expect(screen.getByLabelText(`Insert ${variable}`)).toBeInTheDocument();
    }
  });

  it('calls onInsert with correct variable format on click', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<VariableInsertToolbar onInsert={onInsert} />);

    await user.click(screen.getByLabelText('Insert tenant_name'));
    expect(onInsert).toHaveBeenCalledWith('{{tenant_name}}');
  });

  it('calls onInsert for different variables', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<VariableInsertToolbar onInsert={onInsert} />);

    await user.click(screen.getByLabelText('Insert property_address'));
    expect(onInsert).toHaveBeenCalledWith('{{property_address}}');

    await user.click(screen.getByLabelText('Insert scheduled_date'));
    expect(onInsert).toHaveBeenCalledWith('{{scheduled_date}}');
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<VariableInsertToolbar onInsert={onInsert} disabled />);

    const button = screen.getByLabelText('Insert tenant_name');
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onInsert).not.toHaveBeenCalled();
  });
});
