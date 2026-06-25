import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryModeSelector } from './DeliveryModeSelector';

describe('DeliveryModeSelector', () => {
  it('renders the selected mode label', () => {
    render(<DeliveryModeSelector value="OWNER_ONLY" onChange={vi.fn()} />);
    expect(screen.getByText('Owner only')).toBeInTheDocument();
  });

  it('renders RECIPIENT_LIST label', () => {
    render(<DeliveryModeSelector value="RECIPIENT_LIST" onChange={vi.fn()} />);
    expect(screen.getByText('Recipient list')).toBeInTheDocument();
  });

  it('renders TENANT_WIDE label', () => {
    render(<DeliveryModeSelector value="TENANT_WIDE" onChange={vi.fn()} />);
    expect(screen.getByText('All users in tenant')).toBeInTheDocument();
  });

  it('calls onChange when a mode is selected', async () => {
    const onChange = vi.fn();
    render(<DeliveryModeSelector value="OWNER_ONLY" onChange={onChange} />);
    const trigger = screen.getByLabelText('Delivery mode');
    await userEvent.click(trigger);
    const option = screen.getByText('Recipient list');
    await userEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('RECIPIENT_LIST');
  });

  it('renders as disabled when disabled prop is true', () => {
    render(<DeliveryModeSelector value="OWNER_ONLY" onChange={vi.fn()} disabled />);
    const trigger = screen.getByLabelText('Delivery mode');
    expect(trigger).toBeDisabled();
  });
});
