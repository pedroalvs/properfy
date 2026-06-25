import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeaveWarningModal } from '../LeaveWarningModal';

describe('LeaveWarningModal', () => {
  const onStay = vi.fn();
  const onLeave = vi.fn();

  beforeEach(() => {
    onStay.mockClear();
    onLeave.mockClear();
  });

  it('renders warning message', () => {
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    expect(screen.getByText('Leave inspection?')).toBeInTheDocument();
    expect(screen.getByText(/inspection in progress/)).toBeInTheDocument();
  });

  it('calls onStay when Stay is clicked', async () => {
    const user = userEvent.setup();
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    await user.click(screen.getByTestId('stay-button'));
    expect(onStay).toHaveBeenCalledOnce();
  });

  it('calls onLeave when Leave is clicked', async () => {
    const user = userEvent.setup();
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    await user.click(screen.getByTestId('leave-button'));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('renders with correct test ids', () => {
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    expect(screen.getByTestId('leave-warning-modal')).toBeInTheDocument();
    expect(screen.getByTestId('stay-button')).toBeInTheDocument();
    expect(screen.getByTestId('leave-button')).toBeInTheDocument();
  });
});
