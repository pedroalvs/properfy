import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimezonePicker } from '../TimezonePicker';

describe('TimezonePicker', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockClear();
  });

  it('shows the placeholder when nothing is selected', () => {
    render(<TimezonePicker value={null} onChange={onChange} placeholder="Select timezone" />);
    expect(screen.getByTestId('timezone-picker-trigger')).toHaveTextContent('Select timezone');
  });

  it('shows the selected zone as City (GMT+x)', () => {
    render(<TimezonePicker value="Australia/Sydney" onChange={onChange} />);
    expect(screen.getByTestId('timezone-picker-trigger')).toHaveTextContent(/Sydney \(GMT\+\d+\)/);
  });

  it('opens the overlay on tap and closes via the close button', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value={null} onChange={onChange} />);

    expect(screen.queryByTestId('timezone-picker-overlay')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('timezone-picker-trigger'));
    expect(screen.getByTestId('timezone-picker-overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('Search timezones')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('timezone-picker-overlay')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters options as the user types', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('timezone-picker-trigger'));

    await user.type(screen.getByLabelText('Search timezones'), 'lord howe');

    expect(screen.getByTestId('timezone-option-Australia/Lord_Howe')).toBeInTheDocument();
    expect(screen.queryByTestId('timezone-option-Australia/Sydney')).not.toBeInTheDocument();
  });

  it('selects an option, calls onChange and closes', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('timezone-picker-trigger'));

    await user.type(screen.getByLabelText('Search timezones'), 'sydney');
    await user.click(screen.getByTestId('timezone-option-Australia/Sydney'));

    expect(onChange).toHaveBeenCalledWith('Australia/Sydney');
    expect(screen.queryByTestId('timezone-picker-overlay')).not.toBeInTheDocument();
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('timezone-picker-trigger'));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('timezone-picker-overlay')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a pinned clear row when allowClear and selects the empty value', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value="Australia/Sydney" onChange={onChange} allowClear />);
    await user.click(screen.getByTestId('timezone-picker-trigger'));

    const clearRow = screen.getByTestId('timezone-option-clear');
    expect(clearRow).toHaveTextContent('Platform default (Sydney)');

    await user.click(clearRow);

    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByTestId('timezone-picker-overlay')).not.toBeInTheDocument();
  });

  it('does not render the clear row by default', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('timezone-picker-trigger'));
    expect(screen.queryByTestId('timezone-option-clear')).not.toBeInTheDocument();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<TimezonePicker value={null} onChange={onChange} disabled />);
    await user.click(screen.getByTestId('timezone-picker-trigger'));
    expect(screen.queryByTestId('timezone-picker-overlay')).not.toBeInTheDocument();
  });
});
