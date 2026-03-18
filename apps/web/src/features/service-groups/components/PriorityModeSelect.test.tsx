import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PriorityModeSelect } from './PriorityModeSelect';

vi.mock('@/lib/status-colors', () => ({
  PRIORITY_MODE_MAP: {
    STANDARD: { bg: '#eee', text: '#000', label: 'Standard' },
    PRIORITY_24H: { bg: '#ff0', text: '#000', label: '24h Priority' },
  },
}));

describe('PriorityModeSelect', () => {
  it('renders both options', () => {
    render(<PriorityModeSelect value="" onChange={vi.fn()} />);
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('24h Priority')).toBeInTheDocument();
  });

  it('renders as radio group', () => {
    render(<PriorityModeSelect value="STANDARD" onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
  });

  it('selects the correct value', () => {
    render(<PriorityModeSelect value="STANDARD" onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0]!.checked).toBe(true);
    expect(radios[1]!.checked).toBe(false);
  });

  it('calls onChange when clicking a different option', () => {
    const onChange = vi.fn();
    render(<PriorityModeSelect value="STANDARD" onChange={onChange} />);
    fireEvent.click(screen.getByText('24h Priority'));
    expect(onChange).toHaveBeenCalledWith('PRIORITY_24H');
  });

  it('shows legend label', () => {
    render(<PriorityModeSelect value="" onChange={vi.fn()} />);
    expect(screen.getByText('Priority Mode')).toBeInTheDocument();
  });
});
