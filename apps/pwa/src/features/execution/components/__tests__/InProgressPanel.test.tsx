import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InProgressPanel } from '../InProgressPanel';

describe('InProgressPanel', () => {
  it('renders the in-progress panel with a finish button', () => {
    render(<InProgressPanel startedAt={null} onFinish={vi.fn()} />);
    expect(screen.getByTestId('in-progress-panel')).toBeInTheDocument();
    expect(screen.getByTestId('proceed-to-finish-button')).toHaveTextContent('Finish Inspection');
  });

  it('calls onFinish when the finish button is clicked', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<InProgressPanel startedAt={null} onFinish={onFinish} />);
    await user.click(screen.getByTestId('proceed-to-finish-button'));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('shows elapsed time when startedAt is provided', () => {
    const startedAt = new Date(Date.now() - 65_000).toISOString();
    render(<InProgressPanel startedAt={startedAt} onFinish={vi.fn()} />);
    const elapsed = screen.getByTestId('elapsed-time');
    expect(elapsed).toBeInTheDocument();
    // 65s elapsed → at least "01:0x"
    expect(elapsed).toHaveTextContent(/01:0\d/);
  });

  it('hides elapsed time when startedAt is null', () => {
    render(<InProgressPanel startedAt={null} onFinish={vi.fn()} />);
    expect(screen.queryByTestId('elapsed-time')).not.toBeInTheDocument();
  });
});
