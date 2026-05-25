import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleTabs } from '../ScheduleTabs';

describe('ScheduleTabs', () => {
  it('renders Upcoming and History tabs', () => {
    render(<ScheduleTabs value="upcoming" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
  });

  it('marks Upcoming tab as active when value is "upcoming"', () => {
    render(<ScheduleTabs value="upcoming" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'false');
  });

  it('marks History tab as active when value is "history"', () => {
    render(<ScheduleTabs value="history" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with "history" when History tab is clicked', () => {
    const onChange = vi.fn();
    render(<ScheduleTabs value="upcoming" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });

  it('calls onChange with "upcoming" when Upcoming tab is clicked', () => {
    const onChange = vi.fn();
    render(<ScheduleTabs value="history" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Upcoming' }));
    expect(onChange).toHaveBeenCalledWith('upcoming');
  });
});
