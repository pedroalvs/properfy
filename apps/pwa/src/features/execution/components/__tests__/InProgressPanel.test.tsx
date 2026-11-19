import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InProgressPanel } from '../InProgressPanel';

describe('InProgressPanel', () => {
  it('offers a "Can\'t complete this job" link that opens the sheet (rejection after check-in)', async () => {
    const user = userEvent.setup();
    const onCantComplete = vi.fn();
    render(<InProgressPanel startedAt="2026-03-18T09:00:00Z" onFinish={vi.fn()} onCantComplete={onCantComplete} />);

    await user.click(screen.getByTestId('cant-complete-link'));
    expect(onCantComplete).toHaveBeenCalledOnce();
  });

  it('omits the link when no handler is given', () => {
    render(<InProgressPanel startedAt="2026-03-18T09:00:00Z" onFinish={vi.fn()} />);
    expect(screen.queryByTestId('cant-complete-link')).not.toBeInTheDocument();
  });
});
