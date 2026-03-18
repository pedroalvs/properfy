import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotViewToggle } from './SlotViewToggle';

describe('SlotViewToggle', () => {
  it('renders both buttons', () => {
    render(<SlotViewToggle view="table" onChange={vi.fn()} />);
    expect(screen.getByText('Table')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('highlights table view when active', () => {
    render(<SlotViewToggle view="table" onChange={vi.fn()} />);
    const tableBtn = screen.getByLabelText('Table view');
    expect(tableBtn.className).toContain('bg-primary');
    const calBtn = screen.getByLabelText('Calendar view');
    expect(calBtn.className).toContain('border');
  });

  it('highlights calendar view when active', () => {
    render(<SlotViewToggle view="calendar" onChange={vi.fn()} />);
    const calBtn = screen.getByLabelText('Calendar view');
    expect(calBtn.className).toContain('bg-primary');
    const tableBtn = screen.getByLabelText('Table view');
    expect(tableBtn.className).toContain('border');
  });

  it('calls onChange with "calendar" when calendar clicked', async () => {
    const onChange = vi.fn();
    render(<SlotViewToggle view="table" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Calendar view'));
    expect(onChange).toHaveBeenCalledWith('calendar');
  });

  it('calls onChange with "table" when table clicked', async () => {
    const onChange = vi.fn();
    render(<SlotViewToggle view="calendar" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Table view'));
    expect(onChange).toHaveBeenCalledWith('table');
  });
});
